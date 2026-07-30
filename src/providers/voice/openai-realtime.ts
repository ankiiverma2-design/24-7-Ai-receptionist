/**
 * OpenAI Realtime API adapter.
 *
 * Responsibilities:
 *  - open an authenticated WebSocket to the Realtime API
 *  - build the `session.update` payload from a RealtimeSessionConfig
 *
 * The actual audio bridging (Twilio <-> this socket) lives in the voice
 * orchestrator, which owns turn-taking and tool dispatch.
 */
import { env } from '../../config/env.ts';
import type { RealtimeSessionConfig } from './types.ts';

// Node >=22 provides a global WebSocket client (undici); no dependency needed.

const REALTIME_URL = 'wss://api.openai.com/v1/realtime';

export function connectRealtime(model: string): WebSocket {
  const url = `${REALTIME_URL}?model=${encodeURIComponent(model)}`;
  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });
}

/** Build the session.update message that configures the model for this call. */
export function buildSessionUpdate(config: RealtimeSessionConfig) {
  return {
    type: 'session.update',
    session: {
      modalities: ['audio', 'text'],
      instructions: config.instructions,
      voice: config.voice,
      input_audio_format: config.inputAudioFormat,
      output_audio_format: config.outputAudioFormat,
      // Server-side voice activity detection enables natural barge-in.
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      input_audio_transcription: { model: 'whisper-1' },
      tools: config.tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      tool_choice: 'auto',
      temperature: 0.7,
    },
  };
}
