/**
 * Lightweight event bus.
 *
 * Call lifecycle events are published here; async workers (webhook delivery,
 * CRM/Sheets sync, analytics) subscribe. In production this would be backed by
 * a queue/topic (SQS/PubSub/Kafka); the interface stays the same.
 */
import { EventEmitter } from 'node:events';
import { newId, nowIso } from './ids.ts';
import type { PlatformEvent, PlatformEventType } from './types.ts';

class EventBus {
  private emitter = new EventEmitter();

  publish<T>(orgId: string, type: PlatformEventType, payload: T): PlatformEvent<T> {
    const event: PlatformEvent<T> = {
      id: newId('evt'),
      orgId,
      type,
      payload,
      at: nowIso(),
    };
    this.emitter.emit(type, event);
    this.emitter.emit('*', event);
    return event;
  }

  on<T>(type: PlatformEventType | '*', handler: (event: PlatformEvent<T>) => void): void {
    this.emitter.on(type, handler);
  }
}

export const eventBus = new EventBus();
