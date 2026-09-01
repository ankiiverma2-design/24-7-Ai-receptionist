import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { store } from '../src/core/store.ts';
import { newId, nowIso } from '../src/core/ids.ts';
import { createAgentFromTemplate } from '../src/agents/service.ts';
import { bookAppointment, rescheduleAppointment, cancelAppointment } from '../src/skills/booking.ts';
import { buildTools, dispatchTool } from '../src/skills/tools.ts';
import { verifyStripeSignature, planForPriceId, applyPlan, handleStripeEvent } from '../src/providers/billing/stripe.ts';
import { issueStreamToken, verifyStreamToken } from '../src/telephony/streamToken.ts';
import { RateLimiter } from '../src/server/rateLimit.ts';
import { resolveCalendar } from '../src/providers/calendar/index.ts';
import { tfidfCosine, cosine } from '../src/skills/knowledgeBase.ts';
import { logProvider } from '../src/providers/messaging/index.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createSqliteStore } from '../src/core/sqliteStore.ts';

const orgId = 'org_complete_test';
store.organizations.create({ id: orgId, name: 'Complete', plan: 'pro', createdAt: nowIso() });
const agent = createAgentFromTemplate(orgId, 'dental', 'Complete Dental')!;

test('reschedule and cancel appointment (in-memory calendar)', async () => {
  const slots = await (await import('../src/skills/booking.ts')).getAvailability(agent);
  const booked = await bookAppointment({
    agent,
    service: 'Cleaning',
    startsAt: slots[0].startsAt,
    attendeeEmail: 'a@example.com',
    attendeePhone: '+15550001111',
  });
  assert.equal(booked.ok, true);
  const moved = await rescheduleAppointment(booked.appointment!.id, agent, slots[1].startsAt);
  assert.equal(moved.ok, true);
  assert.equal(moved.appointment?.status, 'rescheduled');
  const cancelled = await cancelAppointment(booked.appointment!.id, agent);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.appointment?.status, 'cancelled');
});

test('tools include reschedule and cancel', () => {
  const names = buildTools(agent).map((t) => t.name);
  assert.ok(names.includes('reschedule_appointment'));
  assert.ok(names.includes('cancel_appointment'));
});

test('dispatch cancel_appointment without an apt returns a note', async () => {
  const call = store.calls.create({
    id: newId('call'),
    orgId,
    agentId: agent.id,
    direction: 'inbound',
    from: 'x',
    to: 'y',
    startedAt: nowIso(),
    transcript: [],
    capturedFields: {},
    provider: 'test',
  });
  const res: any = await dispatchTool('cancel_appointment', {}, { agent, call });
  assert.equal(res.ok, false);
});

test('stripe signature verification', () => {
  const secret = 'whsec_test';
  const raw = '{"id":"evt_1"}';
  const t = '12345';
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${v1}`, secret), true);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${'0'.repeat(64)}`, secret), false);
  assert.equal(verifyStripeSignature(raw, undefined, secret), false);
});

test('stripe webhook checkout.session.completed sets plan', () => {
  const id = newId('org');
  store.organizations.create({ id, name: 'StripeOrg', plan: 'trial', createdAt: nowIso() });
  handleStripeEvent({
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { orgId: id, plan: 'pro' },
        customer: 'cus_123',
        subscription: 'sub_123',
      },
    },
  });
  const org = store.organizations.get(id)!;
  assert.equal(org.plan, 'pro');
  assert.equal(org.stripeCustomerId, 'cus_123');
});

test('applyPlan publishes billing.updated', () => {
  const updated = applyPlan(orgId, 'starter');
  assert.equal(updated?.plan, 'starter');
  applyPlan(orgId, 'pro');
});

test('planForPriceId is undefined without env prices', () => {
  assert.equal(planForPriceId('price_unknown'), undefined);
});

test('stream token binds agent+call and expires check', () => {
  const token = issueStreamToken(agent.id, 'call_abc');
  assert.equal(verifyStreamToken(token, agent.id, 'call_abc'), true);
  assert.equal(verifyStreamToken(token, agent.id, 'call_other'), false);
  assert.equal(verifyStreamToken('nopenope', agent.id, 'call_abc'), false);
});

test('rate limiter eventually blocks', () => {
  const rl = new RateLimiter(2, 0);
  assert.equal(rl.allow('k'), true);
  assert.equal(rl.allow('k'), true);
  assert.equal(rl.allow('k'), false);
});

test('resolveCalendar uses Outlook when integration connected', () => {
  const oid = 'org_outlook_test';
  store.organizations.create({ id: oid, name: 'O', plan: 'pro', createdAt: nowIso() });
  const a = createAgentFromTemplate(oid, 'salon', 'Outlook Salon')!;
  a.definition.booking.provider = 'outlook';
  store.integrations.create({
    id: newId('intg'),
    orgId: oid,
    type: 'outlook_calendar',
    config: { refreshToken: 'fake' },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  assert.equal(resolveCalendar(a).provider.name, 'outlook');
});

test('resolveCalendar uses Cal.com when integration connected', () => {
  const oid = 'org_calcom_test';
  store.organizations.create({ id: oid, name: 'C', plan: 'pro', createdAt: nowIso() });
  const a = createAgentFromTemplate(oid, 'salon', 'Calcom Salon')!;
  a.definition.booking.provider = 'calcom';
  store.integrations.create({
    id: newId('intg'),
    orgId: oid,
    type: 'calcom',
    config: { apiKey: 'cal_x', eventTypeId: '1' },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  assert.equal(resolveCalendar(a).provider.name, 'calcom');
});

test('buildOutlookAuthUrl includes calendar scopes', async () => {
  const { buildOutlookAuthUrl } = await import('../src/providers/calendar/outlook.ts');
  const url = buildOutlookAuthUrl('org_x');
  assert.ok(url.includes('login.microsoftonline.com'));
  assert.match(url, /Calendars\.ReadWrite/);
  assert.equal(new URL(url).searchParams.get('state'), 'org_x');
});

test('tfidf cosine ranks the matching document highest', () => {
  const scores = tfidfCosine('office hours monday', [
    'we sell balloons',
    'our office hours are monday to friday',
    'unrelated rockets',
  ]);
  assert.equal(scores.indexOf(Math.max(...scores)), 1);
});

test('vector cosine of identical embeddings is 1', () => {
  assert.equal(cosine([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test('log messaging provider does not throw', async () => {
  await logProvider.sendSms({ to: '+1', body: 'hi' });
  await logProvider.sendEmail({ to: 'a@b.c', subject: 'x', body: 'y' });
});

test('sqlite store persists entities', () => {
  const file = join(tmpdir(), `voxdesk-${Date.now()}.sqlite`);
  try {
    const s = createSqliteStore(file);
    s.organizations.create({ id: 'org_sql', name: 'SQL', plan: 'trial', createdAt: nowIso() });
    s.leads.create({
      id: 'lead_sql',
      orgId: 'org_sql',
      tags: [],
      attributes: {},
      createdAt: nowIso(),
    } as any);
    assert.equal(s.organizations.get('org_sql')?.name, 'SQL');
    assert.equal(s.leads.list('org_sql').length, 1);
    s.leads.update('lead_sql', { name: 'Ada' } as any);
    assert.equal(s.leads.get('lead_sql')?.name, 'Ada');
    assert.equal(s.leads.delete('lead_sql'), true);
  } finally {
    rmSync(file, { force: true });
  }
});
