/**
 * Lead capture skill.
 *
 * Creates/updates a lead from structured fields the agent extracts during the
 * call, applies a simple heuristic score, and emits a `lead.qualified` event
 * when the lead crosses the qualification threshold (drives CRM/Sheets sync and
 * webhooks downstream).
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { eventBus } from '../core/events.ts';
import type { Agent, Lead } from '../core/types.ts';

export interface CaptureLeadArgs {
  agent: Agent;
  callId?: string;
  name?: string;
  phone?: string;
  email?: string;
  intent?: string;
  service?: string;
  attributes?: Record<string, string>;
}

/** Heuristic 0-100 lead score based on completeness + intent signal. */
export function scoreLead(lead: Partial<Lead>): number {
  let score = 0;
  if (lead.name) score += 20;
  if (lead.phone) score += 25;
  if (lead.email) score += 15;
  if (lead.service) score += 20;
  if (lead.intent) score += 20;
  return Math.min(100, score);
}

export function captureLead(args: CaptureLeadArgs): Lead {
  const { agent } = args;
  const existing = args.callId
    ? store.leads.find((l) => l.callId === args.callId)
    : undefined;

  const merged: Lead = {
    id: existing?.id ?? newId('lead'),
    orgId: agent.orgId,
    callId: args.callId,
    name: args.name ?? existing?.name,
    phone: args.phone ?? existing?.phone,
    email: args.email ?? existing?.email,
    intent: args.intent ?? existing?.intent,
    service: args.service ?? existing?.service,
    tags: existing?.tags ?? [],
    attributes: { ...(existing?.attributes ?? {}), ...(args.attributes ?? {}) },
    createdAt: existing?.createdAt ?? nowIso(),
    score: 0,
  };
  merged.score = scoreLead(merged);

  if (existing) {
    store.leads.update(existing.id, merged);
  } else {
    store.leads.create(merged);
  }

  if ((merged.score ?? 0) >= 60) {
    if (!merged.tags.includes('qualified')) merged.tags.push('qualified');
    eventBus.publish(agent.orgId, 'lead.qualified', merged);
  }
  return merged;
}
