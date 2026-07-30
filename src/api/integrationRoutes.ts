/**
 * Integration API routes (calendar connections).
 *
 * Google Calendar OAuth:
 *   1. GET  /api/integrations/google/auth-url  -> consent URL (state = orgId)
 *   2. Google redirects to /api/integrations/google/callback?code&state
 *   3. We exchange the code for a refresh token and store the integration
 *
 * Also supports a manual connect (for users who already have a refresh token)
 * and listing/disconnecting integrations.
 */
import { Router, json, badRequest, notFound, forbidden, text, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { env, hasGoogle } from '../config/env.ts';
import { hasRole } from '../auth/service.ts';
import type { Integration } from '../core/types.ts';
import { buildGoogleAuthUrl, exchangeCodeForTokens } from '../providers/calendar/google.ts';

function upsertGoogleIntegration(orgId: string, config: Record<string, string>): Integration {
  const existing = store.integrations.find(
    (i) => i.orgId === orgId && i.type === 'google_calendar',
  );
  if (existing) {
    return store.integrations.update(existing.id, {
      config: { ...existing.config, ...config },
      updatedAt: nowIso(),
    })!;
  }
  return store.integrations.create({
    id: newId('intg'),
    orgId,
    type: 'google_calendar',
    config,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function publicIntegration(i: Integration) {
  // Never expose tokens.
  return {
    id: i.id,
    type: i.type,
    calendarId: i.config.calendarId ?? 'primary',
    connected: Boolean(i.config.refreshToken),
    agentId: i.agentId,
    createdAt: i.createdAt,
  };
}

export function registerIntegrationRoutes(r: Router): void {
  r.get('/api/integrations', (c: Ctx) => {
    return json(c.res, 200, {
      integrations: store.integrations.list(c.orgId).map(publicIntegration),
    });
  });

  // Step 1: get the Google consent URL. state carries the orgId so the callback
  // can attribute the connection to the right tenant.
  r.get('/api/integrations/google/auth-url', (c: Ctx) => {
    if (!hasGoogle()) {
      return badRequest(c.res, ['Google is not configured. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.']);
    }
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    return json(c.res, 200, { authUrl: buildGoogleAuthUrl(c.orgId) });
  });

  // Manual connect: store an existing refresh token + optional calendarId.
  r.post('/api/integrations/google/connect', (c: Ctx) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    const { refreshToken, calendarId } = c.body ?? {};
    if (!refreshToken) return badRequest(c.res, ['`refreshToken` is required']);
    const integration = upsertGoogleIntegration(c.orgId, {
      refreshToken: String(refreshToken),
      calendarId: String(calendarId ?? 'primary'),
    });
    return json(c.res, 201, publicIntegration(integration));
  });

  r.delete('/api/integrations/:id', (c: Ctx) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    const integration = store.integrations.get(c.params.id);
    if (!integration || integration.orgId !== c.orgId) return notFound(c.res, 'Integration not found');
    store.integrations.delete(c.params.id);
    return json(c.res, 200, { disconnected: true });
  });
}

/**
 * OAuth callback handler. Registered specially in index.ts because it is hit by
 * Google's redirect (browser GET, no bearer auth) and uses `state` for the org.
 */
export async function handleGoogleCallback(c: Ctx): Promise<void> {
  const code = c.query.get('code');
  const orgId = c.query.get('state');
  const error = c.query.get('error');
  if (error) return text(c.res, 400, `Google authorization failed: ${error}`);
  if (!code || !orgId) return text(c.res, 400, 'Missing code or state');
  if (!store.organizations.get(orgId)) return text(c.res, 400, 'Unknown organization in state');

  try {
    const { refreshToken } = await exchangeCodeForTokens(code);
    upsertGoogleIntegration(orgId, { refreshToken, calendarId: 'primary' });
    return text(
      c.res,
      200,
      '<html><body style="font-family:sans-serif"><h2>Google Calendar connected ✅</h2>' +
        '<p>You can close this tab and return to VoxDesk.</p></body></html>',
      'text/html',
    );
  } catch (e) {
    return text(c.res, 502, `Token exchange failed: ${(e as Error).message}`);
  }
}
