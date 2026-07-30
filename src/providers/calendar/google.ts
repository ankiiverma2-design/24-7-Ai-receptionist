/**
 * Google Calendar provider (zero-dependency, fetch-based).
 *
 * Implements the OAuth2 authorization-code flow (auth URL + code exchange),
 * access-token refresh, free/busy availability, event creation, and
 * cancellation against the Google Calendar API.
 *
 * Credentials passed per call: { refreshToken, calendarId? }. The OAuth client
 * id/secret come from env. Slot math is shared with all providers (slots.ts) so
 * availability behaves consistently.
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

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

/** Build the consent URL to start the OAuth flow. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

/** Exchange an authorization code for tokens (returns the refresh token). */
export async function exchangeCodeForTokens(
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string; access_token: string };
  if (!data.refresh_token) {
    throw new Error('No refresh_token returned. Re-consent with prompt=consent & access_type=offline.');
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google';

  private calendarId(creds: CalendarCredentials): string {
    return creds.calendarId || 'primary';
  }

  async getAvailability(creds: CalendarCredentials, opts: AvailabilityOptions): Promise<TimeSlot[]> {
    const token = await getAccessToken(creds.refreshToken);
    const from = opts.from ?? new Date();
    const timeMin = new Date(from.getTime()).toISOString();
    const timeMax = new Date(from.getTime() + (opts.days + 1) * 86400000).toISOString();

    const res = await fetch(`${CAL_API}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: this.calendarId(creds) }] }),
    });
    if (!res.ok) throw new Error(`Google freeBusy ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      calendars: Record<string, { busy: BusyInterval[] }>;
    };
    const busy = data.calendars[this.calendarId(creds)]?.busy ?? [];
    const candidates = generateCandidateSlots(opts);
    return filterBusy(candidates, busy).slice(0, opts.limit ?? 20);
  }

  async createEvent(creds: CalendarCredentials, input: CreateEventInput): Promise<CreateEventResult> {
    const token = await getAccessToken(creds.refreshToken);
    const body: Record<string, unknown> = {
      summary: input.service,
      description: input.notes,
      start: { dateTime: input.startsAt, timeZone: input.timezone },
      end: { dateTime: input.endsAt, timeZone: input.timezone },
    };
    if (input.attendeeEmail) {
      body.attendees = [{ email: input.attendeeEmail, displayName: input.attendeeName }];
    }
    const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(this.calendarId(creds))}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google event create ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id: string; htmlLink?: string };
    return { externalId: data.id, htmlLink: data.htmlLink };
  }

  async cancelEvent(creds: CalendarCredentials, externalId: string): Promise<void> {
    const token = await getAccessToken(creds.refreshToken);
    const res = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(this.calendarId(creds))}/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    // 410 = already deleted; treat as success.
    if (!res.ok && res.status !== 410) {
      throw new Error(`Google event cancel ${res.status}: ${await res.text()}`);
    }
  }
}

export const googleCalendar = new GoogleCalendarProvider();
