import { store } from '../../core/store.ts';
import type { CrmCredentials, CrmProvider } from './types.ts';
import { hubspotCrm } from './hubspot.ts';

const PROVIDERS: Record<string, CrmProvider> = {
  hubspot: hubspotCrm,
};

export function resolveCrm(orgId: string): { provider: CrmProvider; creds: CrmCredentials } | null {
  const integration = store.integrations.find((i) => i.orgId === orgId && i.type === 'hubspot');
  if (!integration) return null;
  const token = integration.config.accessToken || integration.config.privateAppToken || integration.config.refreshToken;
  if (!token) return null;
  return { provider: PROVIDERS.hubspot, creds: integration.config };
}

export { hubspotCrm };
export type { CrmProvider, CrmCredentials } from './types.ts';
