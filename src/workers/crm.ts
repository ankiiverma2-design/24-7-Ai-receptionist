/**
 * CRM sync worker.
 *
 * On lead.qualified and appointment.booked, upserts a HubSpot contact when the
 * org has a HubSpot integration. Failures are logged; the call path is never blocked.
 */
import { eventBus } from '../core/events.ts';
import { store } from '../core/store.ts';
import { logger } from '../core/logger.ts';
import { resolveCrm } from '../providers/crm/index.ts';
import type { Appointment, Lead, PlatformEvent } from '../core/types.ts';

async function syncLead(orgId: string, lead: Lead, extra?: Record<string, string>): Promise<void> {
  const resolved = resolveCrm(orgId);
  if (!resolved) return;
  if (!lead.email && !lead.phone) return;
  try {
    await resolved.provider.upsertContact(resolved.creds, {
      email: lead.email,
      phone: lead.phone,
      name: lead.name,
      intent: lead.intent,
      service: lead.service,
      score: lead.score,
      source: 'voxdesk',
      attributes: extra,
    });
  } catch (e) {
    logger.warn('CRM sync failed', { orgId, leadId: lead.id, error: (e as Error).message });
  }
}

export function startCrmWorker(): void {
  eventBus.on('lead.qualified', (event: PlatformEvent) => {
    const lead = event.payload as Lead;
    void syncLead(event.orgId, lead);
  });
  eventBus.on('appointment.booked', (event: PlatformEvent) => {
    const apt = event.payload as Appointment;
    const lead = apt.leadId ? store.leads.get(apt.leadId) : undefined;
    if (lead) void syncLead(event.orgId, lead, { appointment: apt.startsAt, service: apt.service });
  });
  logger.info('CRM worker started');
}
