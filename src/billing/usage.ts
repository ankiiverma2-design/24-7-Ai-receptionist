/**
 * Usage metering + plan-limit enforcement.
 *
 * Usage is recorded from authoritative events (e.g. call.completed). Limits are
 * enforced at the moments a tenant tries to consume a resource (create agent,
 * provision number, start outbound call). This is provider-agnostic: it holds
 * regardless of how billing is settled (Stripe, invoice, etc.).
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import type { Organization, UsageRecord } from '../core/types.ts';
import { limitsForPlan } from './plans.ts';

/** Current billing period key, e.g. "2026-07". */
export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function recordUsage(
  orgId: string,
  kind: UsageRecord['kind'],
  quantity: number,
  callId?: string,
): UsageRecord {
  return store.usage.create({
    id: newId('use'),
    orgId,
    period: currentPeriod(),
    kind,
    quantity,
    callId,
    createdAt: nowIso(),
  });
}

export interface UsageSummary {
  period: string;
  callMinutes: number;
  outboundMinutes: number;
  agents: number;
  numbers: number;
  limits: ReturnType<typeof limitsForPlan>;
  minutesRemaining: number;
}

export function getUsageSummary(org: Organization): UsageSummary {
  const period = currentPeriod();
  const records = store.usage.filter((u) => u.orgId === org.id && u.period === period);
  const sum = (kind: UsageRecord['kind']) =>
    records.filter((r) => r.kind === kind).reduce((a, r) => a + r.quantity, 0);

  const callMinutes = sum('call_minutes');
  const outboundMinutes = sum('outbound_minutes');
  const limits = limitsForPlan(org.plan);
  return {
    period,
    callMinutes,
    outboundMinutes,
    agents: store.agents.list(org.id).length,
    numbers: store.numbers.list(org.id).length,
    limits,
    minutesRemaining: Math.max(0, limits.monthlyMinutes - callMinutes - outboundMinutes),
  };
}

export type LimitCheck = { allowed: true } | { allowed: false; reason: string };

/** Gate resource creation against the org's plan. */
export function checkLimit(
  orgId: string,
  resource: 'agent' | 'number' | 'outbound_call' | 'voice_clone',
): LimitCheck {
  const org = store.organizations.get(orgId);
  if (!org) return { allowed: false, reason: 'Organization not found' };
  const limits = limitsForPlan(org.plan);
  const usage = getUsageSummary(org);

  switch (resource) {
    case 'agent':
      return usage.agents < limits.maxAgents
        ? { allowed: true }
        : { allowed: false, reason: `Plan '${org.plan}' allows up to ${limits.maxAgents} agents` };
    case 'number':
      return usage.numbers < limits.maxNumbers
        ? { allowed: true }
        : { allowed: false, reason: `Plan '${org.plan}' allows up to ${limits.maxNumbers} numbers` };
    case 'outbound_call':
      return usage.minutesRemaining > 0
        ? { allowed: true }
        : { allowed: false, reason: `Monthly minute allowance exhausted for plan '${org.plan}'` };
    case 'voice_clone':
      return limits.voiceCloningEnabled
        ? { allowed: true }
        : { allowed: false, reason: `Voice cloning is not available on plan '${org.plan}'` };
    default:
      return { allowed: true };
  }
}
