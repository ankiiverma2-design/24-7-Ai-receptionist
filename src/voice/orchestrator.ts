/**
 * Voice orchestrator.
 *
 * Bridges a Twilio Media Stream (8kHz g711 u-law over WebSocket) to the OpenAI
 * Realtime API and back, owning:
 *   - session setup (persona, voice, tools, audio format)
 *   - audio pass-through both directions (no transcoding: both ends speak g711 u-law)
 *   - barge-in (clear Twilio playback when the caller starts speaking)
 *   - tool dispatch (function calling -> platform skills)
 *   - transcript capture + call finalization
 *
 * Both Twilio and OpenAI Realtime exchange JSON text frames, so the same
 * WsConnection abstraction serves the Twilio side and the global WebSocket
 * serves the OpenAI side.
 */
import type { WsConnection } from '../server/wsServer.ts';
import { store } from '../core/store.ts';
import { nowIso } from '../core/ids.ts';
import { eventBus } from '../core/events.ts';
import { logger } from '../core/logger.ts';
import { env, hasOpenAI } from '../config/env.ts';
import { connectRealtime, buildSessionUpdate } from '../providers/voice/openai-realtime.ts';
import type { Agent, Call, Voice } from '../core/types.ts';
import { buildTools, dispatchTool } from '../skills/tools.ts';
import { buildInstructions } from './instructions.ts';

export interface StartParams {
  agentId: string;
  callId: string;
}

export class VoiceSession {
  private twilio: WsConnection;
  private openai: WebSocket | null = null;
  private streamSid = '';
  private agent: Agent | null = null;
  private call: Call | null = null;
  /** Buffers tool-call argument fragments keyed by call_id. */
  private toolArgs = new Map<string, { name: string; args: string }>();

  constructor(twilio: WsConnection) {
    this.twilio = twilio;
    this.twilio.onMessage((data) => this.onTwilioMessage(data));
    this.twilio.onClose(() => this.finalize());
  }

  private onTwilioMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.event) {
      case 'start':
        this.handleStart(msg.start);
        break;
      case 'media':
        this.forwardAudioToModel(msg.media?.payload);
        break;
      case 'stop':
        this.finalize();
        break;
      default:
        break;
    }
  }

  private handleStart(start: any): void {
    this.streamSid = start?.streamSid ?? '';
    const params = start?.customParameters ?? {};
    const agentId = params.agentId;
    const callId = params.callId;

    this.agent = agentId ? store.agents.get(agentId) ?? null : null;
    this.call = callId ? store.calls.get(callId) ?? null : null;

    if (!this.agent) {
      logger.warn('Voice session start with unknown agent', { agentId });
      this.twilio.close();
      return;
    }
    if (this.call) {
      eventBus.publish(this.agent.orgId, 'call.started', this.call);
    }
    if (!hasOpenAI()) {
      logger.error('OPENAI_API_KEY missing; cannot run voice loop');
      this.twilio.close();
      return;
    }
    this.connectModel();
  }

  private connectModel(): void {
    if (!this.agent) return;
    const agent = this.agent;
    const voice = this.resolveVoice(agent);
    const ws = connectRealtime(env.openaiRealtimeModel);
    this.openai = ws;

    ws.addEventListener('open', () => {
      const sessionUpdate = buildSessionUpdate({
        model: env.openaiRealtimeModel,
        instructions: buildInstructions(agent),
        voice,
        language: agent.definition.languages[0],
        tools: buildTools(agent),
        inputAudioFormat: 'g711_ulaw',
        outputAudioFormat: 'g711_ulaw',
      });
      ws.send(JSON.stringify(sessionUpdate));
      // Kick off the greeting.
      ws.send(JSON.stringify({ type: 'response.create' }));
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      this.onModelMessage(String(ev.data));
    });
    ws.addEventListener('error', () => logger.error('OpenAI realtime socket error'));
    ws.addEventListener('close', () => this.twilio.close());
  }

  /** Choose the provider voice id: cloned/stock if configured, else a default. */
  private resolveVoice(agent: Agent): string {
    if (agent.voiceId) {
      const v: Voice | undefined = store.voices.get(agent.voiceId);
      if (v && (v.type === 'stock' || (v.type === 'cloned' && v.consent?.granted))) {
        return v.providerVoiceId;
      }
    }
    return 'alloy';
  }

  private forwardAudioToModel(payload?: string): void {
    if (!payload || !this.openai || this.openai.readyState !== 1) return;
    this.openai.send(
      JSON.stringify({ type: 'input_audio_buffer.append', audio: payload }),
    );
  }

  private onModelMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'response.audio.delta':
        // Model audio (g711 u-law base64) -> Twilio playback.
        if (msg.delta && this.streamSid) {
          this.twilio.send(
            JSON.stringify({
              event: 'media',
              streamSid: this.streamSid,
              media: { payload: msg.delta },
            }),
          );
        }
        break;

      case 'input_audio_buffer.speech_started':
        // Caller started talking -> barge-in: stop queued playback on Twilio.
        if (this.streamSid) {
          this.twilio.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.appendTranscript('caller', msg.transcript);
        break;

      case 'response.audio_transcript.done':
        this.appendTranscript('agent', msg.transcript);
        break;

      case 'response.function_call_arguments.delta':
        this.bufferToolArgs(msg.call_id, msg.name, msg.delta);
        break;

      case 'response.function_call_arguments.done':
        void this.handleToolCall(msg.call_id, msg.name, msg.arguments);
        break;

      case 'error':
        logger.error('OpenAI realtime error', { error: msg.error });
        break;

      default:
        break;
    }
  }

  private bufferToolArgs(callId: string, name: string | undefined, delta: string | undefined): void {
    if (!callId) return;
    const entry = this.toolArgs.get(callId) ?? { name: name ?? '', args: '' };
    if (name) entry.name = name;
    if (delta) entry.args += delta;
    this.toolArgs.set(callId, entry);
  }

  private async handleToolCall(
    callId: string,
    name: string | undefined,
    argumentsJson: string | undefined,
  ): Promise<void> {
    if (!this.agent || !this.call || !this.openai) return;
    const buffered = this.toolArgs.get(callId);
    const toolName = name ?? buffered?.name ?? '';
    const argsStr = argumentsJson ?? buffered?.args ?? '{}';
    this.toolArgs.delete(callId);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr || '{}');
    } catch {
      args = {};
    }

    // Refresh call from store (tools may have mutated it).
    this.call = store.calls.get(this.call.id) ?? this.call;
    let result: unknown;
    try {
      result = await dispatchTool(toolName, args, { agent: this.agent, call: this.call });
    } catch (e) {
      result = { error: (e as Error).message };
    }

    // Return the tool result to the model and let it continue speaking.
    this.openai.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        },
      }),
    );
    this.openai.send(JSON.stringify({ type: 'response.create' }));
  }

  private appendTranscript(role: 'agent' | 'caller', text?: string): void {
    if (!this.call || !text) return;
    const turn = { role, text, at: nowIso() };
    this.call = store.calls.update(this.call.id, {
      transcript: [...this.call.transcript, turn],
    }) ?? this.call;
  }

  private finalized = false;
  private finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    if (this.openai && this.openai.readyState === 1) this.openai.close();

    if (this.call) {
      const started = new Date(this.call.startedAt).getTime();
      const durationSec = Math.round((Date.now() - started) / 1000);
      const updated = store.calls.update(this.call.id, {
        endedAt: nowIso(),
        durationSec,
        outcome: this.call.outcome ?? 'no_action',
      });
      if (updated) eventBus.publish(updated.orgId, 'call.completed', updated);
    }
  }
}
