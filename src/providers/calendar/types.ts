/**
 * Calendar provider abstraction.
 *
 * Booking goes through this interface so the platform is not coupled to any one
 * calendar. The in-memory provider is fully functional for demos/tests; the
 * Google adapter talks to the real Google Calendar API. Adding Outlook/Cal.com
 * later means implementing this same contract.
 */

export interface TimeSlot {
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
}

export interface AvailabilityOptions {
  /** How many days ahead to search. */
  days: number;
  /** Slot length in minutes. */
  slotMinutes: number;
  /** Business hours (24h), local to the calendar. */
  dayStartHour: number;
  dayEndHour: number;
  /** Search from this instant (defaults to now). */
  from?: Date;
  /** Max slots to return. */
  limit?: number;
}

export interface CreateEventInput {
  service: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  attendeeEmail?: string;
  attendeeName?: string;
  notes?: string;
}

export interface CreateEventResult {
  /** Provider event id, if the provider created a real event. */
  externalId?: string;
  htmlLink?: string;
}

/** Credentials/config for a specific tenant connection. Empty for in-memory. */
export type CalendarCredentials = Record<string, string>;

export interface CalendarProvider {
  readonly name: string;
  getAvailability(creds: CalendarCredentials, opts: AvailabilityOptions): Promise<TimeSlot[]>;
  createEvent(creds: CalendarCredentials, input: CreateEventInput): Promise<CreateEventResult>;
  cancelEvent(creds: CalendarCredentials, externalId: string): Promise<void>;
}
