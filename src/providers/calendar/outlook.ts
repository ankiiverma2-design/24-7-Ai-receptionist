/**
 * Microsoft Outlook / Graph calendar provider (zero-dependency, fetch-based).
 *
 * OAuth2 authorization-code flow against Entra ID, then Calendar.ReadWrite
 * via Microsoft Graph: getSchedule for free/busy, events create/delete.
 *
 * Credentials: { refreshToken }. Optional: { calendarId }.
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
import { generateCandidateSlots, filterBusy, type BusyInterval } from './slots.ts';

const SCOPE = 'offline_access Calendars.ReadWrite';

function tenant(): string {
  return env.microsoftTenant || 'common';
}

function oauthBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}

export function buildOutlookAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.microsoftClientId,
    redirect_uri: env.microsoftRedirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPE,
    state,
  });
  return `${oauthBase()}/authorize?${params.toString()}`;
}

export async function exchangeOutlookCode(
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(`${oauthBase()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.microsoftClientId,
      client_secret: env.microsoftClientSecret,
      redirect_uri: env.microsoftRedirectUri,
      code,
      grant_type: 'authorization_code',
      scope: SCOPE,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Outlook token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string; access_token: string };
  if (!data.refresh_token) throw new Error('No refresh_token returned from Microsoft.');
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(`${oauthBase()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.microsoftClientId,
      client_secret: env.microsoftClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPE,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Outlook token refresh ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export class OutlookCalendarProvider implements CalendarProvider {
  readonly name = 'outlook';

  async getAvailability(creds: CalendarCredentials, opts: AvailabilityOptions): Promise<TimeSlot[]> {
    const token = await getAccessToken(creds.refreshToken);
    const from = opts.from ?? new Date();
    const start = from.toISOString();
    const end = new Date(from.getTime() + (opts.days + 1) * 86400000).toISOString();
    const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedules: ['me'],
        startTime: { dateTime: start, timeZone: 'UTC' },
        endTime: { dateTime: end, timeZone: 'UTC' },
        availabilityViewInterval: opts.slotMinutes,
      }),
    });
    if (!res.ok) throw new Error(`Outlook getSchedule ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      value?: Array<{ scheduleItems?: Array<{ start: { dateTime: string }; end: { dateTime: string } }> }>;
    };
    const busy: BusyInterval[] = (data.value?.[0]?.scheduleItems ?? []).map((item) => ({
      start: item.start.dateTime.endsWith('Z') ? item.start.dateTime : `${item.start.dateTime}Z`,
      end: item.end.dateTime.endsWith('Z') ? item.end.dateTime : `${item.end.dateTime}Z`,
    }));
    return filterBusy(generateCandidateSlots(opts), busy).slice(0, opts.limit ?? 20);
  }

  async createEvent(creds: CalendarCredentials, input: CreateEventInput): Promise<CreateEventResult> {
    const token = await getAccessToken(creds.refreshToken);
    const body: Record<string, unknown> = {
      subject: input.service,
      body: { contentType: 'text', content: input.notes ?? '' },
      start: { dateTime: input.startsAt, timeZone: input.timezone },
      end: { dateTime: input.endsAt, timeZone: input.timezone },
    };
    if (input.attendeeEmail) {
      body.attendees = [
        {
          emailAddress: { address: input.attendeeEmail, name: input.attendeeName ?? input.attendeeEmail },
          type: 'required',
        },
      ];
    }
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Outlook event create ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; webLink?: string };
    return { externalId: data.id, htmlLink: data.webLink };
  }

  async cancelEvent(creds: CalendarCredentials, externalId: string): Promise<void> {
    const token = await getAccessToken(creds.refreshToken);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Outlook event cancel ${res.status}: ${await res.text()}`);
    }
  }
}

export const outlookCalendar = new OutlookCalendarProvider();
