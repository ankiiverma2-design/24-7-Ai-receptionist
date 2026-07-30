/**
 * Plan definitions and limits.
 *
 * These back usage metering and limit enforcement. A real deployment maps these
 * to Stripe products/prices; the limits here are enforced regardless of the
 * billing provider so a tenant cannot exceed their tier.
 */
import type { Organization } from '../core/types.ts';

export interface PlanLimits {
  /** Included call minutes per billing period. */
  monthlyMinutes: number;
  maxAgents: number;
  maxNumbers: number;
  maxConcurrentCalls: number;
  voiceCloningEnabled: boolean;
}

export const PLANS: Record<Organization['plan'], PlanLimits> = {
  trial: { monthlyMinutes: 60, maxAgents: 2, maxNumbers: 1, maxConcurrentCalls: 2, voiceCloningEnabled: false },
  starter: { monthlyMinutes: 500, maxAgents: 5, maxNumbers: 3, maxConcurrentCalls: 5, voiceCloningEnabled: false },
  pro: { monthlyMinutes: 3000, maxAgents: 25, maxNumbers: 20, maxConcurrentCalls: 25, voiceCloningEnabled: true },
  scale: { monthlyMinutes: 25000, maxAgents: 250, maxNumbers: 200, maxConcurrentCalls: 200, voiceCloningEnabled: true },
};

export function limitsForPlan(plan: Organization['plan']): PlanLimits {
  return PLANS[plan] ?? PLANS.trial;
}
