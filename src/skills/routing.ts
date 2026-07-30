/**
 * Routing / transfer / business-hours skill.
 *
 * Decides whether a call should be handled by the AI, transferred to a human, or
 * sent to voicemail based on the agent's routing config and current time.
 */
import type { Agent, BusinessHours } from '../core/types.ts';

export interface RoutingDecision {
  action: 'handle' | 'transfer' | 'voicemail';
  transferNumber?: string;
  reason: string;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Is the business currently open per its configured hours? */
export function isWithinBusinessHours(hours: BusinessHours | undefined, now = new Date()): boolean {
  if (!hours) return true; // no hours configured => always available (24/7)
  const weekday = now.getDay();
  const window = hours.days[weekday];
  if (!window) return false;
  const [open, close] = window;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= hhmmToMinutes(open) && minutes < hhmmToMinutes(close);
}

/** Decide what to do when a human is explicitly requested or escalation triggers. */
export function decideEscalation(agent: Agent, now = new Date()): RoutingDecision {
  const routing = agent.definition.routing;
  const open = isWithinBusinessHours(routing.businessHours, now);

  if (routing.transferEnabled && routing.transferNumber && open) {
    return {
      action: 'transfer',
      transferNumber: routing.transferNumber,
      reason: 'Escalation requested during business hours.',
    };
  }

  // After hours (or transfer disabled): fall back per configured behavior.
  if (routing.afterHoursBehavior === 'voicemail') {
    return { action: 'voicemail', reason: 'After hours: capturing voicemail.' };
  }
  // 'book' or 'message' => AI keeps handling the call.
  return { action: 'handle', reason: 'AI continues handling the call.' };
}
