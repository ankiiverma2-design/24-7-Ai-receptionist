/**
 * Seeds a demo organization + a couple of agents so the dashboard and API are
 * usable immediately on first boot.
 */
import { store } from '../core/store.ts';
import { nowIso } from '../core/ids.ts';
import { logger } from '../core/logger.ts';
import { DEFAULT_ORG_ID, DEFAULT_USER_EMAIL } from '../config/constants.ts';
import { createAgentFromTemplate, publishAgent } from '../agents/service.ts';

export function seedDemo(): void {
  if (store.organizations.get(DEFAULT_ORG_ID)) return;

  store.organizations.create({
    id: DEFAULT_ORG_ID,
    name: 'Demo Organization',
    createdAt: nowIso(),
    plan: 'trial',
  });
  store.users.create({
    id: 'usr_demo',
    orgId: DEFAULT_ORG_ID,
    email: DEFAULT_USER_EMAIL,
    role: 'owner',
    createdAt: nowIso(),
  });

  // A ready-to-use live agent so an inbound call works out of the box.
  const dental = createAgentFromTemplate(DEFAULT_ORG_ID, 'dental', 'Bright Smile Dental');
  if (dental) publishAgent(dental.id);
  createAgentFromTemplate(DEFAULT_ORG_ID, 'hvac', 'Cool Air HVAC');

  logger.info('Seeded demo org and agents', { orgId: DEFAULT_ORG_ID });
}
