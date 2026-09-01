/**
 * Booking skill.
 *
 * Availability and appointment create/reschedule/cancel route through the
 * resolved calendar provider. We only mark an Appointment booked after the
 * calendar provider confirms the event.
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

function endsAt(startsAt: string, slotMinutes: number): string {
  return new Date(new Date(startsAt).getTime() + slotMinutes * 60000).toISOString();
}

/** Get bookable slots from the agent's calendar provider (real or in-memory). */
export async function getAvailability(agent: Agent, days = 5): Promise<AvailabilitySlot[]> {
  const { provider, creds } = resolveCalendar(agent);
  try {
    return await provider.getAvailability(creds, availabilityOptions(agent, days));
  } catch (e) {
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
  attendeePhone?: string;
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
    logger.warn('Calendar event creation failed', {
      provider: provider.name,
      error: (e as Error).message,
    });
    return { ok: false, error: 'calendar_unavailable' };
  }

  const appointment: Appointment = {
    id: newId('apt'),
    orgId: agent.orgId,
    agentId: agent.id,
    callId: args.callId,
    leadId: args.leadId,
    service: args.service,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: 'booked',
    timezone: agent.definition.booking.timezone,
    createdAt: nowIso(),
    externalId,
    attendeeEmail: args.attendeeEmail,
    attendeeName: args.attendeeName,
    attendeePhone: args.attendeePhone,
  };
  const stored = store.appointments.create(appointment);
  eventBus.publish(agent.orgId, 'appointment.booked', stored);
  return { ok: true, appointment: stored, htmlLink };
}

export async function cancelAppointment(
  appointmentId: string,
  agent: Agent,
): Promise<{ ok: boolean; appointment?: Appointment; error?: string }> {
  const existing = store.appointments.get(appointmentId);
  if (!existing || existing.orgId !== agent.orgId) {
    return { ok: false, error: 'not_found' };
  }
  if (existing.status === 'cancelled') return { ok: true, appointment: existing };

  const { provider, creds } = resolveCalendar(agent);
  if (existing.externalId) {
    try {
      await provider.cancelEvent(creds, existing.externalId);
    } catch (e) {
      logger.warn('Calendar event cancel failed', {
        provider: provider.name,
        error: (e as Error).message,
      });
      return { ok: false, error: 'calendar_unavailable' };
    }
  }
  const updated = store.appointments.update(appointmentId, { status: 'cancelled' });
  if (updated) eventBus.publish(agent.orgId, 'appointment.cancelled', updated);
  return { ok: true, appointment: updated };
}

export async function rescheduleAppointment(
  appointmentId: string,
  agent: Agent,
  newStartsAt: string,
): Promise<BookResult> {
  const existing = store.appointments.get(appointmentId);
  if (!existing || existing.orgId !== agent.orgId) {
    return { ok: false, error: 'not_found' };
  }
  const slotMinutes = agent.definition.booking.slotMinutes || 30;
  const start = new Date(newStartsAt);
  const end = new Date(start.getTime() + slotMinutes * 60000);
  const { provider, creds } = resolveCalendar(agent);

  if (existing.externalId) {
    try {
      await provider.cancelEvent(creds, existing.externalId);
    } catch (e) {
      logger.warn('Calendar event cancel (reschedule) failed', {
        provider: provider.name,
        error: (e as Error).message,
      });
      return { ok: false, error: 'calendar_unavailable' };
    }
  }

  let externalId: string | undefined;
  let htmlLink: string | undefined;
  try {
    const result = await provider.createEvent(creds, {
      service: existing.service,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: existing.timezone,
      attendeeEmail: existing.attendeeEmail,
      attendeeName: existing.attendeeName,
    });
    externalId = result.externalId;
    htmlLink = result.htmlLink;
  } catch (e) {
    logger.warn('Calendar event create (reschedule) failed', {
      provider: provider.name,
      error: (e as Error).message,
    });
    return { ok: false, error: 'calendar_unavailable' };
  }

  const updated = store.appointments.update(appointmentId, {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: 'rescheduled',
    externalId,
  });
  if (updated) eventBus.publish(agent.orgId, 'appointment.rescheduled', updated);
  return { ok: true, appointment: updated, htmlLink };
}

export { endsAt };
