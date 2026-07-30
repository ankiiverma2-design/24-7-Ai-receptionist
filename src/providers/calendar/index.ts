/**
 * Calendar provider registry + tenant credential resolution.
 *
 * Given an agent, resolves which provider to use (from its booking config) and
 * the credentials for that org's connected integration. Falls back to the
 * in-memory provider when no real integration is connected, so booking always
 * works.
 */
import { store } from '../../core/store.ts';
import type { Agent } from '../../core/types.ts';
import type { CalendarCredentials, CalendarProvider } from './types.ts';
import { inMemoryCalendar } from './inMemory.ts';
import { googleCalendar } from './google.ts';

const PROVIDERS: Record<string, CalendarProvider> = {
  in_memory: inMemoryCalendar,
  google: googleCalendar,
};

const INTEGRATION_TYPE: Record<string, string> = {
  google: 'google_calendar',
};

export interface ResolvedCalendar {
  provider: CalendarProvider;
  creds: CalendarCredentials;
}

/**
 * Resolve the calendar provider + credentials for an agent. If the configured
 * provider needs an integration that isn't connected, fall back to in-memory.
 */
export function resolveCalendar(agent: Agent): ResolvedCalendar {
  const configured = agent.definition.booking.provider;
  const provider = PROVIDERS[configured];
  const integrationType = INTEGRATION_TYPE[configured];

  if (provider && integrationType) {
    const integration = store.integrations.find(
      (i) =>
        i.orgId === agent.orgId &&
        i.type === integrationType &&
        (!i.agentId || i.agentId === agent.id),
    );
    if (integration) return { provider, creds: integration.config };
  }

  return { provider: inMemoryCalendar, creds: {} };
}
