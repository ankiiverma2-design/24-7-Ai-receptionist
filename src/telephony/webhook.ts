/**
 * Twilio voice webhook.
 *
 * When a call hits a provisioned number, Twilio POSTs here. We create the Call
 * record and return TwiML that opens a bidirectional Media Stream to our
 * WebSocket endpoint, passing agentId + callId as stream parameters so the
 * orchestrator knows which agent to run.
 */
import type { Ctx } from '../server/http.ts';
import { text } from '../server/http.ts';
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { env } from '../config/env.ts';
import { issueStreamToken } from './streamToken.ts';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  );
}

/** Resolve the agent for an incoming call: explicit query, or number mapping. */
function resolveAgentId(ctx: Ctx, calledNumber?: string): string | undefined {
  const fromQuery = ctx.query.get('agentId');
  if (fromQuery) return fromQuery;
  if (calledNumber) {
    const num = store.numbers.find((n) => n.e164 === calledNumber);
    if (num?.agentId) return num.agentId;
  }
  // Fall back to the first live agent in the demo org.
  const live = store.agents.filter((a) => a.status === 'live');
  return live[0]?.id;
}

export function handleVoiceWebhook(ctx: Ctx): void {
  const body = ctx.body ?? {};
  const from = body.From ?? 'unknown';
  const to = body.To ?? 'unknown';
  const callSid = body.CallSid ?? newId('sid');

  const agentId = resolveAgentId(ctx, to);
  const agent = agentId ? store.agents.get(agentId) : undefined;

  if (!agent) {
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>' +
      'Sorry, no receptionist is configured for this number.' +
      '</Say><Hangup/></Response>';
    return text(ctx.res, 200, twiml, 'text/xml');
  }

  // Create (or reuse) the call record.
  const callId = ctx.query.get('callId') ?? newId('call');
  if (!store.calls.get(callId)) {
    store.calls.create({
      id: callId,
      orgId: agent.orgId ?? DEFAULT_ORG_ID,
      agentId: agent.id,
      direction: ctx.query.get('callId') ? 'outbound' : 'inbound',
      from,
      to,
      startedAt: nowIso(),
      transcript: [],
      capturedFields: {},
      provider: 'twilio',
      providerRef: callSid,
    });
  }

  // Build the wss:// media-stream URL from the public base URL.
  const streamToken = issueStreamToken(agent.id, callId);
  const wsUrl =
    env.publicBaseUrl.replace(/^http/, 'ws').replace(/\/$/, '') +
    `/telephony/media?token=${encodeURIComponent(streamToken)}`;

  const twiml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    '<Connect>' +
    `<Stream url="${escapeXml(wsUrl)}">` +
    `<Parameter name="agentId" value="${escapeXml(agent.id)}"/>` +
    `<Parameter name="callId" value="${escapeXml(callId)}"/>` +
    `<Parameter name="streamToken" value="${escapeXml(streamToken)}"/>` +
    '</Stream>' +
    '</Connect>' +
    '</Response>';

  text(ctx.res, 200, twiml, 'text/xml');
}
