/**
 * Cal.com calendar provider (API-key based, fetch).
 *
 * Credentials: { apiKey, eventTypeId }. Availability uses /v1/slots; booking
 * uses /v1/bookings; cancel uses /v1/bookings/:id/cancel.
 */
import { env } from '../../config/env.ts';
import type {
  AvailabilityOptions,
  CalendarCredentials,
  CalendarProvider,
  CreateEventInput,
  CreateEventResult,
  TimeSlot,
} from './types.ts';

function base(creds: CalendarCredentials): string {
  return (creds.apiBase || env.calcomApiBase || 'https://api.cal.com/v1').replace(/\/$/, '');
}

function apiKey(creds: CalendarCredentials): string {
  return creds.apiKey || env.calcomApiKey;
}

export class CalcomCalendarProvider implements CalendarProvider {
  readonly name = 'calcom';

  async getAvailability(creds: CalendarCredentials, opts: AvailabilityOptions): Promise<TimeSlot[]> {
    const from = opts.from ?? new Date();
    const startTime = from.toISOString();
    const endTime = new Date(from.getTime() + opts.days * 86400000).toISOString();
    const eventTypeId = creds.eventTypeId;
    if (!eventTypeId) throw new Error('Cal.com eventTypeId is required');
    const q = new URLSearchParams({
      apiKey: apiKey(creds),
      eventTypeId,
      startTime,
      endTime,
    });
    const res = await fetch(`${base(creds)}/slots?${q.toString()}`);
    if (!res.ok) throw new Error(`Cal.com slots ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { slots?: Record<string, Array<{ time: string }>> };
    const slots: TimeSlot[] = [];
    const minutes = opts.slotMinutes || 30;
    for (const day of Object.values(data.slots ?? {})) {
      for (const s of day) {
        const start = new Date(s.time);
        slots.push({
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + minutes * 60000).toISOString(),
        });
      }
    }
    return slots.slice(0, opts.limit ?? 20);
  }

  async createEvent(creds: CalendarCredentials, input: CreateEventInput): Promise<CreateEventResult> {
    const res = await fetch(`${base(creds)}/bookings?apiKey=${encodeURIComponent(apiKey(creds))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventTypeId: Number(creds.eventTypeId),
        start: input.startsAt,
        end: input.endsAt,
        timeZone: input.timezone,
        language: 'en',
        metadata: {},
        responses: {
          name: input.attendeeName || 'Caller',
          email: input.attendeeEmail || 'noreply@localhost',
          notes: input.notes ?? input.service,
        },
      }),
    });
    if (!res.ok) throw new Error(`Cal.com booking ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id?: number | string; uid?: string };
    const id = String(data.uid ?? data.id ?? '');
    return { externalId: id || undefined };
  }

  async cancelEvent(creds: CalendarCredentials, externalId: string): Promise<void> {
    const res = await fetch(
      `${base(creds)}/bookings/${encodeURIComponent(externalId)}/cancel?apiKey=${encodeURIComponent(apiKey(creds))}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Cal.com cancel ${res.status}: ${await res.text()}`);
    }
  }
}

export const calcomCalendar = new CalcomCalendarProvider();
