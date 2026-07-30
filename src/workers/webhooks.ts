/**
 * Webhook delivery worker.
 *
 * Subscribes to the event bus and delivers signed, JSON payloads to tenant
 * webhook subscriptions with a small retry. Signature is an HMAC-SHA256 of the
 * body using the subscription secret (header: X-VoxDesk-Signature).
 */
import { createHmac } from 'node:crypto';
import { eventBus } from '../core/events.ts';
import { store } from '../core/store.ts';
import { logger } from '../core/logger.ts';
import type { PlatformEvent } from '../core/types.ts';

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function deliver(url: string, secret: string, event: PlatformEvent, attempt = 1): Promise<void> {
  const body = JSON.stringify({ id: event.id, type: event.type, at: event.at, data: event.payload });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VoxDesk-Signature': sign(secret, body),
        'X-VoxDesk-Event': event.type,
      },
      body,
    });
    if (!res.ok && attempt < 3) {
      setTimeout(() => void deliver(url, secret, event, attempt + 1), attempt * 1000);
    }
  } catch (e) {
    logger.warn('Webhook delivery failed', { url, attempt, error: (e as Error).message });
    if (attempt < 3) {
      setTimeout(() => void deliver(url, secret, event, attempt + 1), attempt * 1000);
    }
  }
}

export function startWebhookWorker(): void {
  eventBus.on('*', (event: PlatformEvent) => {
    const subs = store.webhooks.filter(
      (s) =>
        s.orgId === event.orgId &&
        s.active &&
        (s.events.includes('*') || s.events.includes(event.type)),
    );
    for (const sub of subs) void deliver(sub.url, sub.secret, event);
  });
  logger.info('Webhook worker started');
}
