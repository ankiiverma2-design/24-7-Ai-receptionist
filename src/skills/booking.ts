/**
 * Booking skill.
 *
 * Availability and appointment creation route through the resolved calendar
 * provider (see providers/calendar). The in-memory provider is used when no real
 * calendar integration is connected, so booking always works; when a Google
 * Calendar integration is connected, availability reflects real free/busy and a
 * real calendar event is created.
 *
 * IMPORTANT: we only mark the internal Appointment as "booked" after the calendar
 * provider confirms the event, so we never tell a caller something is booked when
 * it isn't.
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { eventBus } from '../core/events.ts';
import { logger } from '../core/logger.ts';
import type { Agent, Appointment } from '../core/types.ts';
import { resolveCalendar } from '../providers/calendar/index.ts';
import type { AvailabilityOptions } from '../providers/calendar/types.ts';

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

function availabilityOptions(agent: Agent, days: number): AvailabilityOptions {
  return {
    days,
    slotMinutes: agent.definition.booking.slotMinutes || 30,
    dayStartHour: 9,
    dayEndHour: 16,
    limit: 20,
  };
}

/** Get bookable slots from the agent's calendar provider (real or in-memory). */
export async function getAvailability(agent: Agent, days = 5): Promise<AvailabilitySlot[]> {
  const { provider, creds } = resolveCalendar(agent);
  try {
    return await provider.getAvailability(creds, availabilityOptions(agent, days));
  } catch (e) {
    // Degrade gracefully to in-memory slots if the external calendar errors.
    logger.warn('Calendar availability failed; falling back', {
      provider: provider.name,
      error: (e as Error).message,
    });
    const { inMemoryCalendar } = await import('../providers/calendar/inMemory.ts');
    return inMemoryCalendar.getAvailability({}, availabilityOptions(agent, days));
  }
}

export interface BookArgs {
  agent: Agent;
  callId?: string;
  leadId?: string;
  service: string;
  startsAt: string;
  attendeeEmail?: string;
  attendeeName?: string;
}

export interface BookResult {
  appointment?: Appointment;
  ok: boolean;
  error?: string;
  htmlLink?: string;
}

export async function bookAppointment(args: BookArgs): Promise<BookResult> {
  const { agent } = args;
  const slotMinutes = agent.definition.booking.slotMinutes || 30;
  const start = new Date(args.startsAt);
  const end = new Date(start.getTime() + slotMinutes * 60000);
  const { provider, creds } = resolveCalendar(agent);

  let externalId: string | undefined;
  let htmlLink: string | undefined;
  try {
    const result = await provider.createEvent(creds, {
      service: args.service,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: agent.definition.booking.timezone,
      attendeeEmail: args.attendeeEmail,
      attendeeName: args.attendeeName,
    });
    externalId = result.externalId;
    htmlLink = result.htmlLink;
  } catch (e) {
    // Do NOT create a "booked" record if the real calendar rejected it.
    logger.warn('Calendar event creation failed', {
      provider: provider.name,
      error: (e as Error).message,
    });
    return { ok: false, error: 'calendar_unavailable' };
  }

  const appointment: Appointment = {
    id: newId('apt'),
    orgId: agent.orgId,
    callId: args.callId,
    leadId: args.leadId,
    service: args.service,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: 'booked',
    timezone: agent.definition.booking.timezone,
    createdAt: nowIso(),
  };
  // Persist provider event id for later reschedule/cancel, when present.
  const stored = store.appointments.create(
    externalId ? ({ ...appointment, externalId } as Appointment & { externalId: string }) : appointment,
  );
  eventBus.publish(agent.orgId, 'appointment.booked', stored);
  return { ok: true, appointment: stored, htmlLink };
}
