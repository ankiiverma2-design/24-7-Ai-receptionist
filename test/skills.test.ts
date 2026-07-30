import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/core/store.ts';
import { newId, nowIso } from '../src/core/ids.ts';
import { createAgentFromTemplate } from '../src/agents/service.ts';
import { getAvailability, bookAppointment } from '../src/skills/booking.ts';
import { searchKnowledgeBase } from '../src/skills/knowledgeBase.ts';
import { scoreLead } from '../src/skills/leadCapture.ts';
import { isWithinBusinessHours } from '../src/skills/routing.ts';
import { buildTools, dispatchTool } from '../src/skills/tools.ts';

const orgId = 'org_skills_test';
store.organizations.create({ id: orgId, name: 'Skills', plan: 'pro', createdAt: nowIso() });
const agent = createAgentFromTemplate(orgId, 'dental', 'Test Dental')!;

test('availability returns weekday slots', () => {
  const slots = getAvailability(agent);
  assert.ok(slots.length > 0);
  assert.ok(new Date(slots[0].startsAt).getTime() > Date.now());
});

test('booking persists and emits', () => {
  const slots = getAvailability(agent);
  const appt = bookAppointment({ agent, service: 'Cleaning', startsAt: slots[0].startsAt });
  assert.equal(appt.status, 'booked');
  assert.ok(store.appointments.get(appt.id));
});

test('knowledge base grounds a match and refuses when none', () => {
  const hit = searchKnowledgeBase('what are your opening hours', agent.definition.knowledgeBase);
  assert.ok(hit && /Monday/.test(hit.entry.answer));
  const miss = searchKnowledgeBase('do you sell rockets spaceships', agent.definition.knowledgeBase);
  assert.equal(miss, null);
});

test('lead scoring rewards completeness', () => {
  assert.equal(scoreLead({ name: 'A', phone: '1', email: 'e', service: 's', intent: 'i' }), 100);
  assert.ok(scoreLead({ name: 'A' }) < 60);
});

test('business hours logic', () => {
  const bh = { timezone: 'UTC', days: { 1: ['09:00', '17:00'] as [string, string] } };
  assert.equal(isWithinBusinessHours(bh, new Date('2026-07-27T10:00:00Z')), true);
  assert.equal(isWithinBusinessHours(bh, new Date('2026-07-27T20:00:00Z')), false);
  assert.equal(isWithinBusinessHours(undefined), true);
});

test('tools registry + dispatch (capture_lead, lookup_faq)', async () => {
  const names = buildTools(agent).map((t) => t.name);
  assert.ok(names.includes('book_appointment') && names.includes('lookup_faq') && names.includes('capture_lead'));

  const call = store.calls.create({
    id: newId('call'), orgId, agentId: agent.id, direction: 'inbound',
    from: 'x', to: 'y', startedAt: nowIso(), transcript: [], capturedFields: {}, provider: 'test',
  });
  const cap: any = await dispatchTool('capture_lead', { name: 'Jane', phone: '+15551234567', service: 'Cleaning' }, { agent, call });
  assert.equal(cap.saved, true);
  assert.ok(cap.score >= 60);

  const faq: any = await dispatchTool('lookup_faq', { question: 'what are your hours today' }, { agent, call });
  assert.equal(faq.found, true);
});
