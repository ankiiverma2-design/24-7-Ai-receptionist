/**
 * Booking skill.
 *
 * Provides availability + appointment creation. The default 'in_memory' provider
 * is fully functional for demos and testing; 'google'/'outlook'/'calcom' are
 * where real calendar adapters plug in (stubbed with a clear TODO so the tool
 * contract is stable for the orchestrator today).
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { eventBus } from '../core/events.ts';
import type { Agent, Appointment } from '../core/types.ts';

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
}

/** Generate simple availability slots over the next N business days. */
export function getAvailability(agent: Agent, days = 5): AvailabilitySlot[] {
  const slotMinutes = agent.definition.booking.slotMinutes || 30;
  const slots: AvailabilitySlot[] = [];
  const now = new Date();
  for (let d = 1; d <= days; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // skip weekends by default
    // 9:00 -> 16:00 slots
    for (let hour = 9; hour < 16; hour++) {
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + slotMinutes * 60000);
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }
  return slots.slice(0, 20);
}

export interface BookArgs {
  agent: Agent;
  callId?: string;
  leadId?: string;
  service: string;
  startsAt: string;
}

export function bookAppointment(args: BookArgs): Appointment {
  const { agent } = args;
  const slotMinutes = agent.definition.booking.slotMinutes || 30;
  const start = new Date(args.startsAt);
  const end = new Date(start.getTime() + slotMinutes * 60000);

  // TODO: for provider !== 'in_memory', call the real calendar adapter here.
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
  store.appointments.create(appointment);
  eventBus.publish(agent.orgId, 'appointment.booked', appointment);
  return appointment;
}
