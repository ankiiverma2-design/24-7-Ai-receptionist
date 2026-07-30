/**
 * Auth + account API routes.
 *
 * Public: signup, login, accept-invite.
 * Authenticated: me, logout, API key management, org member management.
 */
import { Router, json, badRequest, notFound, forbidden, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import {
  signup,
  login,
  logout,
  createApiKey,
  revokeApiKey,
  inviteUser,
  acceptInvitation,
  hasRole,
} from '../auth/service.ts';
import type { Role } from '../core/types.ts';

function bearerToken(c: Ctx): string | null {
  const h = c.req.headers['authorization'];
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function publicUser(userId?: string) {
  const u = userId ? store.users.get(userId) : undefined;
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, orgId: u.orgId };
}

export function registerAuthRoutes(r: Router): void {
  // ---- Public ----
  r.post('/api/auth/signup', (c) => {
    const { email, password, orgName, name } = c.body ?? {};
    const result = signup({ email, password, orgName, name });
    if (!result.ok) return badRequest(c.res, result.errors);
    const { org, user, token } = result.value;
    return json(c.res, 201, {
      token,
      org: { id: org.id, name: org.name, plan: org.plan },
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  r.post('/api/auth/login', (c) => {
    const { email, password } = c.body ?? {};
    const result = login(String(email ?? ''), String(password ?? ''));
    if (!result.ok) return json(c.res, 401, { error: 'invalid_credentials' });
    return json(c.res, 200, {
      token: result.value.token,
      user: publicUser(result.value.user.id),
    });
  });

  r.post('/api/auth/accept-invite', (c) => {
    const { token, password, name } = c.body ?? {};
    const result = acceptInvitation(String(token ?? ''), String(password ?? ''), name);
    if (!result.ok) return badRequest(c.res, result.errors);
    return json(c.res, 201, { token: result.value.token, user: publicUser(result.value.user.id) });
  });

  // ---- Authenticated ----
  r.get('/api/auth/me', (c) => {
    const org = store.organizations.get(c.orgId);
    return json(c.res, 200, {
      org: org ? { id: org.id, name: org.name, plan: org.plan } : { id: c.orgId },
      user: publicUser(c.userId),
      via: c.via,
      role: c.role,
    });
  });

  r.post('/api/auth/logout', (c) => {
    const token = bearerToken(c);
    if (token) logout(token);
    return json(c.res, 200, { ok: true });
  });

  // ---- API keys ----
  r.get('/api/keys', (c) => {
    const keys = store.apiKeys
      .list(c.orgId)
      .filter((k) => !k.revokedAt)
      .map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt }));
    return json(c.res, 200, { keys });
  });

  r.post('/api/keys', (c) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    const { name, scopes } = c.body ?? {};
    const { apiKey, token } = createApiKey(c.orgId, String(name ?? 'API key'), scopes);
    // Full token returned exactly once.
    return json(c.res, 201, { id: apiKey.id, name: apiKey.name, token });
  });

  r.delete('/api/keys/:id', (c) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    return revokeApiKey(c.orgId, c.params.id)
      ? json(c.res, 200, { revoked: true })
      : notFound(c.res, 'API key not found');
  });

  // ---- Org members / invitations ----
  r.get('/api/org/members', (c) => {
    const members = store.users
      .list(c.orgId)
      .map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role }));
    return json(c.res, 200, { members });
  });

  r.post('/api/org/invite', (c) => {
    if (!hasRole(c.role ?? 'member', 'admin')) return forbidden(c.res);
    const { email, role } = c.body ?? {};
    const result = inviteUser(c.orgId, String(email ?? ''), (role as Role) ?? 'member');
    if (!result.ok) return badRequest(c.res, result.errors);
    // The invite token would normally be emailed; returned here for API use.
    return json(c.res, 201, { invitationId: result.value.invitation.id, inviteToken: result.value.token });
  });
}
