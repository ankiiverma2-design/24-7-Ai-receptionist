/**
 * Text-mode agent simulation.
 *
 * Runs the same persona + tools as a live call, but over text via the Chat
 * Completions API. Invaluable for testing an agent's behavior (qualification,
 * FAQ grounding, booking) without provisioning a phone number. Uses the same
 * tool registry and dispatch path as the voice orchestrator.
 */
import { env, hasOpenAI } from '../config/env.ts';
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import type { Agent, Call } from '../core/types.ts';
import { buildInstructions } from '../voice/instructions.ts';
import { buildTools, dispatchTool } from '../skills/tools.ts';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export interface SimMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SimResult {
  reply: string;
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  callId: string;
}

/** Ephemeral call used to give tools a context during simulation. */
function ephemeralCall(agent: Agent): Call {
  const call: Call = {
    id: newId('simcall'),
    orgId: agent.orgId,
    agentId: agent.id,
    direction: 'inbound',
    from: 'simulation',
    to: 'simulation',
    startedAt: nowIso(),
    transcript: [],
    capturedFields: {},
    provider: 'simulation',
  };
  store.calls.create(call);
  return call;
}

export async function runTextSimulation(
  agent: Agent,
  history: SimMessage[],
): Promise<SimResult> {
  if (!hasOpenAI()) {
    throw new Error('OPENAI_API_KEY is required for simulation.');
  }
  const call = ephemeralCall(agent);
  const tools = buildTools(agent).map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: any[] = [
    { role: 'system', content: buildInstructions(agent) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolCalls: SimResult['toolCalls'] = [];

  // Bounded tool loop: allow a few rounds of tool use before final reply.
  for (let round = 0; round < 5; round++) {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, tools, tool_choice: 'auto' }),
    });
    if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    const choice = data.choices?.[0]?.message;
    messages.push(choice);

    if (choice?.tool_calls?.length) {
      for (const tc of choice.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          /* ignore */
        }
        const freshCall = store.calls.get(call.id) ?? call;
        const result = await dispatchTool(tc.function.name, args, { agent, call: freshCall });
        toolCalls.push({ name: tc.function.name, args, result });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue; // let the model incorporate tool results
    }

    return { reply: choice?.content ?? '', toolCalls, callId: call.id };
  }

  return { reply: '(no final reply)', toolCalls, callId: call.id };
}
