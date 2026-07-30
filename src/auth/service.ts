/**
 * Auth service: organizations, users, sessions, API keys, and invitations.
 *
 * This replaces the single shared admin token with real multi-tenant identity.
 * Signup creates an organization and its owner. Login issues a session token.
 * API keys are for programmatic access. Invitations let owners/admins add users.
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import type { ApiKey, Invitation, Organization, Role, Session, User } from '../core/types.ts';
import {
  hashPassword,
  isStrongEnough,
  isValidEmail,
  verifyPassword,
} from './passwords.ts';
import { generateApiKey, generateToken, hashToken } from './tokens.ts';
import { err, ok, type Result } from '../core/validate.ts';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthContext {
  orgId: string;
  userId?: string;
  role: Role;
  via: 'session' | 'api_key' | 'admin_token';
}

export interface SignupResult {
  org: Organization;
  user: User;
  token: string;
}

/** Create an organization + owner user, and return a fresh session token. */
export function signup(input: {
  email: string;
  password: string;
  orgName?: string;
  name?: string;
}): Result<SignupResult> {
  if (!isValidEmail(input.email)) return err('A valid email is required');
  if (!isStrongEnough(input.password)) return err('Password must be at least 8 characters');
  const existing = store.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (existing) return err('An account with this email already exists');

  const org = store.organizations.create({
    id: newId('org'),
    name: input.orgName?.trim() || `${input.email.split('@')[0]}'s workspace`,
    plan: 'trial',
    createdAt: nowIso(),
  });

  const user = store.users.create({
    id: newId('usr'),
    orgId: org.id,
    email: input.email.toLowerCase(),
    name: input.name,
    role: 'owner',
    passwordHash: hashPassword(input.password),
    createdAt: nowIso(),
  });

  const token = createSession(user).token;
  return ok({ org, user, token });
}

export function login(email: string, password: string): Result<{ user: User; token: string }> {
  const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return err('Invalid email or password');
  }
  return ok({ user, token: createSession(user).token });
}

export function createSession(user: User): { session: Session; token: string } {
  const token = generateToken();
  const session = store.sessions.create({
    id: newId('sess'),
    orgId: user.orgId,
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt: nowIso(),
  });
  return { session, token };
}

export function resolveSession(token: string): AuthContext | null {
  const tokenHash = hashToken(token);
  const session = store.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    store.sessions.delete(session.id);
    return null;
  }
  const user = store.users.get(session.userId);
  if (!user) return null;
  return { orgId: session.orgId, userId: user.id, role: user.role, via: 'session' };
}

export function logout(token: string): void {
  const tokenHash = hashToken(token);
  const session = store.sessions.find((s) => s.tokenHash === tokenHash);
  if (session) store.sessions.delete(session.id);
}

// ---- API keys ----

export function createApiKey(
  orgId: string,
  name: string,
  scopes: string[] = ['*'],
): { apiKey: ApiKey; token: string } {
  const { token, prefix, tokenHash } = generateApiKey();
  const apiKey = store.apiKeys.create({
    id: newId('key'),
    orgId,
    name: name || 'API key',
    prefix,
    tokenHash,
    scopes,
    createdAt: nowIso(),
  });
  return { apiKey, token };
}

export function resolveApiKey(token: string): AuthContext | null {
  const tokenHash = hashToken(token);
  const key = store.apiKeys.find((k) => k.tokenHash === tokenHash && !k.revokedAt);
  if (!key) return null;
  store.apiKeys.update(key.id, { lastUsedAt: nowIso() });
  // API keys act with admin privileges within their org for now.
  return { orgId: key.orgId, role: 'admin', via: 'api_key' };
}

export function revokeApiKey(orgId: string, id: string): boolean {
  const key = store.apiKeys.get(id);
  if (!key || key.orgId !== orgId) return false;
  store.apiKeys.update(id, { revokedAt: nowIso() });
  return true;
}

// ---- Invitations ----

export function inviteUser(
  orgId: string,
  email: string,
  role: Role,
): Result<{ invitation: Invitation; token: string }> {
  if (!isValidEmail(email)) return err('A valid email is required');
  const token = generateToken();
  const invitation = store.invitations.create({
    id: newId('inv'),
    orgId,
    email: email.toLowerCase(),
    role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    createdAt: nowIso(),
  });
  return ok({ invitation, token });
}

export function acceptInvitation(
  token: string,
  password: string,
  name?: string,
): Result<{ user: User; token: string }> {
  if (!isStrongEnough(password)) return err('Password must be at least 8 characters');
  const tokenHash = hashToken(token);
  const invitation = store.invitations.find((i) => i.tokenHash === tokenHash && !i.acceptedAt);
  if (!invitation) return err('Invalid or already-used invitation');
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return err('Invitation has expired');

  const user = store.users.create({
    id: newId('usr'),
    orgId: invitation.orgId,
    email: invitation.email,
    name,
    role: invitation.role,
    passwordHash: hashPassword(password),
    createdAt: nowIso(),
  });
  store.invitations.update(invitation.id, { acceptedAt: nowIso() });
  return ok({ user, token: createSession(user).token });
}

/** Role hierarchy check for authorization gates. */
export function hasRole(role: Role, required: Role): boolean {
  const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
  return rank[role] >= rank[required];
}
