import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/core/store.ts';
import { limitsForPlan, PLANS } from '../src/billing/plans.ts';
import { currentPeriod, recordUsage, getUsageSummary, checkLimit } from '../src/billing/usage.ts';
import { newId, nowIso } from '../src/core/ids.ts';

function makeOrg(plan: 'trial' | 'starter' | 'pro' | 'scale') {
  const id = newId('org');
  store.organizations.create({ id, name: 'Billing Test', plan, createdAt: nowIso() });
  return id;
}

test('plan limits are defined for all tiers', () => {
  for (const plan of Object.keys(PLANS) as (keyof typeof PLANS)[]) {
    const l = limitsForPlan(plan);
    assert.ok(l.monthlyMinutes > 0 && l.maxAgents > 0);
  }
});

test('currentPeriod is YYYY-MM', () => {
  assert.match(currentPeriod(new Date('2026-07-30T00:00:00Z')), /^2026-07$/);
});

test('usage summary aggregates minutes for the period', () => {
  const orgId = makeOrg('starter');
  recordUsage(orgId, 'call_minutes', 10);
  recordUsage(orgId, 'call_minutes', 5);
  recordUsage(orgId, 'outbound_minutes', 3);
  const org = store.organizations.get(orgId)!;
  const summary = getUsageSummary(org);
  assert.equal(summary.callMinutes, 15);
  assert.equal(summary.outboundMinutes, 3);
  assert.equal(summary.minutesRemaining, limitsForPlan('starter').monthlyMinutes - 18);
});

test('agent limit enforced on trial plan', () => {
  const orgId = makeOrg('trial'); // maxAgents = 2
  assert.equal(checkLimit(orgId, 'agent').allowed, true);
  store.agents.create({ id: newId('agt'), orgId, name: '1' } as any);
  store.agents.create({ id: newId('agt'), orgId, name: '2' } as any);
  const blocked = checkLimit(orgId, 'agent');
  assert.equal(blocked.allowed, false);
});

test('voice cloning gated by plan', () => {
  assert.equal(checkLimit(makeOrg('trial'), 'voice_clone').allowed, false);
  assert.equal(checkLimit(makeOrg('pro'), 'voice_clone').allowed, true);
});

test('outbound blocked when minutes exhausted', () => {
  const orgId = makeOrg('trial'); // 60 minutes
  recordUsage(orgId, 'call_minutes', 60);
  assert.equal(checkLimit(orgId, 'outbound_call').allowed, false);
});
