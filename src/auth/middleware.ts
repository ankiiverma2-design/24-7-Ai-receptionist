/**
 * Request authentication.
 *
 * Resolves an AuthContext from the Authorization header, trying in order:
 *   1. A user session token (from login/signup).
 *   2. An API key (vk_...).
 *   3. The legacy API_ADMIN_TOKEN, which maps to the demo org as owner. This
 *      keeps the earlier single-token workflow working for local/dev use.
 */
import type { IncomingMessage } from 'node:http';
import { env } from '../config/env.ts';
import { DEFAULT_ORG_ID } from '../config/constants.ts';
import { resolveApiKey, resolveSession, type AuthContext } from './service.ts';

function bearer(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function resolveAuth(req: IncomingMessage): AuthContext | null {
  const token = bearer(req);
  if (!token) return null;

  if (token.startsWith('vk_')) {
    return resolveApiKey(token);
  }

  const session = resolveSession(token);
  if (session) return session;

  // Legacy admin token -> demo org owner (backward compatible).
  if (env.apiAdminToken && token === env.apiAdminToken) {
    return { orgId: DEFAULT_ORG_ID, role: 'owner', via: 'admin_token' };
  }

  return null;
}
