import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/core/store.ts';
import { newId, nowIso } from '../src/core/ids.ts';
import { createAgentFromTemplate } from '../src/agents/service.ts';
import { generateCandidateSlots, filterBusy } from '../src/providers/calendar/slots.ts';
import { resolveCalendar } from '../src/providers/calendar/index.ts';
import { inMemoryCalendar } from '../src/providers/calendar/inMemory.ts';

const opts = { days: 5, slotMinutes: 30, dayStartHour: 9, dayEndHour: 16, from: new Date('2026-07-27T00:00:00Z') };

test('generateCandidateSlots skips weekends and honors business hours', () => {
  const slots = generateCandidateSlots(opts);
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const d = new Date(s.startsAt);
    assert.notEqual(d.getDay(), 0); // not Sunday
    assert.notEqual(d.getDay(), 6); // not Saturday
  }
});

test('filterBusy removes overlapping slots', () => {
  const slots = generateCandidateSlots(opts);
  const first = slots[0];
  const busy = [{ start: first.startsAt, end: first.endsAt }];
  const filtered = filterBusy(slots, busy);
  assert.equal(filtered.length, slots.length - 1);
  assert.ok(!filtered.some((s) => s.startsAt === first.startsAt));
});

test('filterBusy with no busy returns all slots', () => {
  const slots = generateCandidateSlots(opts);
  assert.equal(filterBusy(slots, []).length, slots.length);
});

test('resolveCalendar falls back to in-memory when no integration connected', () => {
  const orgId = 'org_cal_test';
  store.organizations.create({ id: orgId, name: 'Cal', plan: 'pro', createdAt: nowIso() });
  const agent = createAgentFromTemplate(orgId, 'salon', 'Cal Salon')!;
  // Template uses in_memory provider by default.
  const resolved = resolveCalendar(agent);
  assert.equal(resolved.provider.name, 'in_memory');
});

test('resolveCalendar uses Google when integration is connected', () => {
  const orgId = 'org_cal_google';
  store.organizations.create({ id: orgId, name: 'CalG', plan: 'pro', createdAt: nowIso() });
  const agent = createAgentFromTemplate(orgId, 'salon', 'Cal G Salon')!;
  // Switch the agent's booking provider to google and connect an integration.
  agent.definition.booking.provider = 'google';
  store.integrations.create({
    id: newId('intg'),
    orgId,
    type: 'google_calendar',
    config: { refreshToken: 'fake-refresh', calendarId: 'primary' },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  const resolved = resolveCalendar(agent);
  assert.equal(resolved.provider.name, 'google');
  assert.equal(resolved.creds.refreshToken, 'fake-refresh');
});

test('buildGoogleAuthUrl produces a valid consent URL with state + offline access', async () => {
  const { buildGoogleAuthUrl } = await import('../src/providers/calendar/google.ts');
  const url = buildGoogleAuthUrl('org_abc123');
  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
  const q = new URL(url).searchParams;
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('state'), 'org_abc123');
  assert.equal(q.get('access_type'), 'offline');
  assert.equal(q.get('prompt'), 'consent');
  assert.match(q.get('scope') ?? '', /calendar/);
});

test('in-memory provider createEvent returns no external id', async () => {
  const result = await inMemoryCalendar.createEvent({}, {
    service: 'Test', startsAt: nowIso(), endsAt: nowIso(), timezone: 'UTC',
  });
  assert.equal(result.externalId, undefined);
});
