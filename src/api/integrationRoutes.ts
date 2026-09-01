/**
 * Integration API routes (calendar + CRM connections).
 *
 * OAuth callbacks are registered in index.ts (browser redirects, no bearer).
 */
import { Router, json, badRequest, notFound, forbidden, text, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { hasGoogle, hasMicrosoft, hasHubSpotOAuth } from '../config/env.ts';
import { hasRole } from '../auth/service.ts';
import type { Integration } from '../core/types.ts';
import { buildGoogleAuthUrl, exchangeCodeForTokens } from '../providers/calendar/google.ts';
import { buildOutlookAuthUrl, exchangeOutlookCode } from '../providers/calendar/outlook.ts';
import { buildHubSpotAuthUrl, exchangeHubSpotCode } from '../providers/crm/hubspot.ts';

type IntegrationType = Integration['type'];

function upsertIntegration(
  orgId: string,
  type: IntegrationType,
  config: Record<string, string>,
): Integration {
  const existing = store.integrations.find((i) => i.orgId === orgId && i.type === type);
  if (existing) {
    return store.integrations.update(existing.id, {
      config: { ...existing.config, ...config },
      updatedAt: nowIso(),
    })!;
  }
  return store.integrations.create({
    id: newId('intg'),
    orgId,
    type,
    config,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function publicIntegration(i: Integration) {
  const connected = Boolean(
    i.config.refreshToken || i.config.apiKey || i.config.privateAppToken || i.config.accessToken,
  );
  return {
    id: i.id,
    type: i.type,
    calendarId: i.config.calendarId ?? (i.type.includes('calendar') ? 'primary' : undefined),
    eventTypeId: i.config.eventTypeId,
    connected,
    agentId: i.agentId,
    createdAt: i.createdAt,
  };
}

function requireAdmin(c: Ctx): boolean {
  return hasRole(c.role ?? 'member', 'admin');
}

export function registerIntegrationRoutes(r: Router): void {
  r.get('/api/integrations', (c: Ctx) => {
    return json(c.res, 200, {
      integrations: store.integrations.list(c.orgId).map(publicIntegration),
    });
  });

  r.get('/api/integrations/google/auth-url', (c: Ctx) => {
    if (!hasGoogle()) {
      return badRequest(c.res, ['Google is not configured. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.']);
    }
    if (!requireAdmin(c)) return forbidden(c.res);
    return json(c.res, 200, { authUrl: buildGoogleAuthUrl(c.orgId) });
  });

  r.post('/api/integrations/google/connect', (c: Ctx) => {
    if (!requireAdmin(c)) return forbidden(c.res);
    const { refreshToken, calendarId } = c.body ?? {};
    if (!refreshToken) return badRequest(c.res, ['`refreshToken` is required']);
    const integration = upsertIntegration(c.orgId, 'google_calendar', {
      refreshToken: String(refreshToken),
      calendarId: String(calendarId ?? 'primary'),
    });
    return json(c.res, 201, publicIntegration(integration));
  });

  r.get('/api/integrations/outlook/auth-url', (c: Ctx) => {
    if (!hasMicrosoft()) {
      return badRequest(c.res, ['Microsoft is not configured. Set MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI.']);
    }
    if (!requireAdmin(c)) return forbidden(c.res);
    return json(c.res, 200, { authUrl: buildOutlookAuthUrl(c.orgId) });
  });

  r.post('/api/integrations/outlook/connect', (c: Ctx) => {
    if (!requireAdmin(c)) return forbidden(c.res);
    const { refreshToken } = c.body ?? {};
    if (!refreshToken) return badRequest(c.res, ['`refreshToken` is required']);
    const integration = upsertIntegration(c.orgId, 'outlook_calendar', {
      refreshToken: String(refreshToken),
    });
    return json(c.res, 201, publicIntegration(integration));
  });

  r.post('/api/integrations/calcom/connect', (c: Ctx) => {
    if (!requireAdmin(c)) return forbidden(c.res);
    const { apiKey, eventTypeId, apiBase } = c.body ?? {};
    if (!apiKey || !eventTypeId) return badRequest(c.res, ['`apiKey` and `eventTypeId` are required']);
    const integration = upsertIntegration(c.orgId, 'calcom', {
      apiKey: String(apiKey),
      eventTypeId: String(eventTypeId),
      ...(apiBase ? { apiBase: String(apiBase) } : {}),
    });
    return json(c.res, 201, publicIntegration(integration));
  });

  r.get('/api/integrations/hubspot/auth-url', (c: Ctx) => {
    if (!hasHubSpotOAuth()) {
      return badRequest(c.res, ['HubSpot OAuth is not configured. Set HUBSPOT_CLIENT_ID/SECRET/REDIRECT_URI.']);
    }
    if (!requireAdmin(c)) return forbidden(c.res);
    return json(c.res, 200, { authUrl: buildHubSpotAuthUrl(c.orgId) });
  });

  r.post('/api/integrations/hubspot/connect', (c: Ctx) => {
    if (!requireAdmin(c)) return forbidden(c.res);
    const { privateAppToken, refreshToken, accessToken } = c.body ?? {};
    if (!privateAppToken && !refreshToken && !accessToken) {
      return badRequest(c.res, ['Provide `privateAppToken` or OAuth tokens']);
    }
    const config: Record<string, string> = {};
    if (privateAppToken) config.privateAppToken = String(privateAppToken);
    if (refreshToken) config.refreshToken = String(refreshToken);
    if (accessToken) config.accessToken = String(accessToken);
    const integration = upsertIntegration(c.orgId, 'hubspot', config);
    return json(c.res, 201, publicIntegration(integration));
  });

  r.delete('/api/integrations/:id', (c: Ctx) => {
    if (!requireAdmin(c)) return forbidden(c.res);
    const integration = store.integrations.get(c.params.id);
    if (!integration || integration.orgId !== c.orgId) return notFound(c.res, 'Integration not found');
    store.integrations.delete(c.params.id);
    return json(c.res, 200, { disconnected: true });
  });
}

export async function handleGoogleCallback(c: Ctx): Promise<void> {
  const code = c.query.get('code');
  const orgId = c.query.get('state');
  const error = c.query.get('error');
  if (error) return text(c.res, 400, `Google authorization failed: ${error}`);
  if (!code || !orgId) return text(c.res, 400, 'Missing code or state');
  if (!store.organizations.get(orgId)) return text(c.res, 400, 'Unknown organization in state');

  try {
    const { refreshToken } = await exchangeCodeForTokens(code);
    upsertIntegration(orgId, 'google_calendar', { refreshToken, calendarId: 'primary' });
    return text(
      c.res,
      200,
      '<html><body style="font-family:sans-serif"><h2>Google Calendar connected</h2>' +
        '<p>You can close this tab and return to VoxDesk.</p></body></html>',
      'text/html',
    );
  } catch (e) {
    return text(c.res, 502, `Token exchange failed: ${(e as Error).message}`);
  }
}

export async function handleOutlookCallback(c: Ctx): Promise<void> {
  const code = c.query.get('code');
  const orgId = c.query.get('state');
  const error = c.query.get('error');
  if (error) return text(c.res, 400, `Microsoft authorization failed: ${error}`);
  if (!code || !orgId) return text(c.res, 400, 'Missing code or state');
  if (!store.organizations.get(orgId)) return text(c.res, 400, 'Unknown organization in state');
  try {
    const { refreshToken } = await exchangeOutlookCode(code);
    upsertIntegration(orgId, 'outlook_calendar', { refreshToken });
    return text(
      c.res,
      200,
      '<html><body style="font-family:sans-serif"><h2>Outlook Calendar connected</h2>' +
        '<p>You can close this tab and return to VoxDesk.</p></body></html>',
      'text/html',
    );
  } catch (e) {
    return text(c.res, 502, `Token exchange failed: ${(e as Error).message}`);
  }
}

export async function handleHubSpotCallback(c: Ctx): Promise<void> {
  const code = c.query.get('code');
  const orgId = c.query.get('state');
  const error = c.query.get('error');
  if (error) return text(c.res, 400, `HubSpot authorization failed: ${error}`);
  if (!code || !orgId) return text(c.res, 400, 'Missing code or state');
  if (!store.organizations.get(orgId)) return text(c.res, 400, 'Unknown organization in state');
  try {
    const { refreshToken, accessToken } = await exchangeHubSpotCode(code);
    upsertIntegration(orgId, 'hubspot', { refreshToken, accessToken });
    return text(
      c.res,
      200,
      '<html><body style="font-family:sans-serif"><h2>HubSpot connected</h2>' +
        '<p>You can close this tab and return to VoxDesk.</p></body></html>',
      'text/html',
    );
  } catch (e) {
    return text(c.res, 502, `Token exchange failed: ${(e as Error).message}`);
  }
}
