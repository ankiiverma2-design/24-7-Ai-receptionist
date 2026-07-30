/**
 * Pure slot math shared by all calendar providers.
 *
 * `generateCandidateSlots` produces business-hours slots over the next N days
 * (skipping weekends). `filterBusy` removes any slot overlapping a busy window.
 * Keeping these pure makes them trivially unit-testable without any network.
 */
import type { AvailabilityOptions, TimeSlot } from './types.ts';

export interface BusyInterval {
  start: string;
  end: string;
}

export function generateCandidateSlots(opts: AvailabilityOptions): TimeSlot[] {
  const from = opts.from ?? new Date();
  const slots: TimeSlot[] = [];
  for (let d = 1; d <= opts.days; d++) {
    const day = new Date(from);
    day.setDate(from.getDate() + d);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // skip weekends
    for (let hour = opts.dayStartHour; hour < opts.dayEndHour; hour++) {
      const start = new Date(day);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + opts.slotMinutes * 60000);
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }
  return slots;
}

function overlaps(slot: TimeSlot, busy: BusyInterval): boolean {
  const s = new Date(slot.startsAt).getTime();
  const e = new Date(slot.endsAt).getTime();
  const bs = new Date(busy.start).getTime();
  const be = new Date(busy.end).getTime();
  return s < be && e > bs;
}

export function filterBusy(slots: TimeSlot[], busy: BusyInterval[]): TimeSlot[] {
  if (busy.length === 0) return slots;
  return slots.filter((slot) => !busy.some((b) => overlaps(slot, b)));
}
