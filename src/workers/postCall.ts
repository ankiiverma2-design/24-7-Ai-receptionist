/**
 * Post-call worker.
 *
 * On `call.completed` it:
 *   1. Meters call minutes for billing (authoritative usage event).
 *   2. If OpenAI is configured and a transcript exists, generates a short
 *      summary + sentiment via the LLM router and stores it on the call.
 *
 * Runs off the event bus so it never blocks the live call path.
 */
import { eventBus } from '../core/events.ts';
import { store } from '../core/store.ts';
import { logger } from '../core/logger.ts';
import { hasOpenAI } from '../config/env.ts';
import { complete } from '../providers/llm/router.ts';
import { recordUsage } from '../billing/usage.ts';
import type { Call, PlatformEvent } from '../core/types.ts';

function meterCall(call: Call): void {
  const minutes = Math.max(1, Math.ceil((call.durationSec ?? 0) / 60));
  recordUsage(
    call.orgId,
    call.direction === 'outbound' ? 'outbound_minutes' : 'call_minutes',
    minutes,
    call.id,
  );
}

async function summarize(call: Call): Promise<void> {
  if (!hasOpenAI() || call.transcript.length === 0) return;
  const convo = call.transcript
    .map((t) => `${t.role}: ${t.text}`)
    .join('\n')
    .slice(0, 6000);
  try {
    const raw = await complete({
      task: 'summarize',
      json: true,
      system:
        'You summarize a phone call for a business dashboard. Return strict JSON: ' +
        '{"summary": string (max 2 sentences), "sentiment": "positive"|"neutral"|"negative"}.',
      user: convo,
    });
    const parsed = JSON.parse(raw) as { summary?: string; sentiment?: string };
    const sentiment =
      parsed.sentiment === 'positive' || parsed.sentiment === 'negative'
        ? parsed.sentiment
        : 'neutral';
    store.calls.update(call.id, { summary: parsed.summary, sentiment });
  } catch (e) {
    logger.warn('Post-call summarization failed', { callId: call.id, error: (e as Error).message });
  }
}

export function startPostCallWorker(): void {
  eventBus.on('call.completed', (event: PlatformEvent) => {
    const call = event.payload as Call;
    try {
      meterCall(call);
    } catch (e) {
      logger.warn('Usage metering failed', { callId: call.id, error: (e as Error).message });
    }
    void summarize(call);
  });
  logger.info('Post-call worker started');
}
