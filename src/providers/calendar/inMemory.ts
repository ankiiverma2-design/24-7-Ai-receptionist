/**
 * In-memory calendar provider.
 *
 * Fully functional for demos/tests: it returns generated business-hours slots
 * and "creates" events without an external system. The internal Appointment
 * record (in the store) is the source of truth for this provider.
 */
import type {
  AvailabilityOptions,
  CalendarProvider,
  CreateEventInput,
  CreateEventResult,
  TimeSlot,
} from './types.ts';
import { generateCandidateSlots } from './slots.ts';

export class InMemoryCalendarProvider implements CalendarProvider {
  readonly name = 'in_memory';

  async getAvailability(_creds: Record<string, string>, opts: AvailabilityOptions): Promise<TimeSlot[]> {
    const slots = generateCandidateSlots(opts);
    return slots.slice(0, opts.limit ?? 20);
  }

  async createEvent(_creds: Record<string, string>, _input: CreateEventInput): Promise<CreateEventResult> {
    return {}; // no external event; internal Appointment record suffices
  }

  async cancelEvent(): Promise<void> {
    // no-op for in-memory
  }
}

export const inMemoryCalendar = new InMemoryCalendarProvider();
