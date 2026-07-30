import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isValidEmail, isStrongEnough } from '../src/auth/passwords.ts';
import { generateApiKey, hashToken } from '../src/auth/tokens.ts';
import {
  signup,
  login,
  resolveSession,
  logout,
  createApiKey,
  resolveApiKey,
  revokeApiKey,
  inviteUser,
  acceptInvitation,
  hasRole,
} from '../src/auth/service.ts';

test('password hashing round-trips and rejects wrong password', () => {
  const h = hashPassword('correct horse battery staple');
  assert.ok(h.includes(':'));
  assert.equal(verifyPassword('correct horse battery staple', h), true);
  assert.equal(verifyPassword('wrong', h), false);
});

test('email + strength validators', () => {
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('nope'), false);
  assert.equal(isStrongEnough('1234567'), false);
  assert.equal(isStrongEnough('12345678'), true);
});

test('api key hashing is stable and prefixed', () => {
  const k = generateApiKey();
  assert.ok(k.token.startsWith('vk_'));
  assert.equal(k.prefix, k.token.slice(0, 10));
  assert.equal(k.tokenHash, hashToken(k.token));
});

test('signup creates org+owner and a usable session', () => {
  const res = signup({ email: 'owner1@test.com', password: 'password123', orgName: 'T1' });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const ctx = resolveSession(res.value.token);
  assert.ok(ctx);
  assert.equal(ctx?.orgId, res.value.org.id);
  assert.equal(ctx?.role, 'owner');
  assert.equal(ctx?.via, 'session');
});

test('duplicate signup is rejected', () => {
  signup({ email: 'dupe@test.com', password: 'password123' });
  const again = signup({ email: 'dupe@test.com', password: 'password123' });
  assert.equal(again.ok, false);
});

test('login succeeds with correct credentials and fails otherwise', () => {
  signup({ email: 'login@test.com', password: 'password123' });
  assert.equal(login('login@test.com', 'password123').ok, true);
  assert.equal(login('login@test.com', 'bad').ok, false);
  assert.equal(login('missing@test.com', 'password123').ok, false);
});

test('logout invalidates the session', () => {
  const res = signup({ email: 'logout@test.com', password: 'password123' });
  if (!res.ok) return;
  assert.ok(resolveSession(res.value.token));
  logout(res.value.token);
  assert.equal(resolveSession(res.value.token), null);
});

test('api key resolves to its org and can be revoked', () => {
  const res = signup({ email: 'keys@test.com', password: 'password123' });
  if (!res.ok) return;
  const { apiKey, token } = createApiKey(res.value.org.id, 'ci');
  const ctx = resolveApiKey(token);
  assert.equal(ctx?.orgId, res.value.org.id);
  assert.equal(ctx?.via, 'api_key');
  assert.equal(revokeApiKey(res.value.org.id, apiKey.id), true);
  assert.equal(resolveApiKey(token), null);
});

test('invitation flow creates a member in the inviting org', () => {
  const res = signup({ email: 'inviteowner@test.com', password: 'password123' });
  if (!res.ok) return;
  const inv = inviteUser(res.value.org.id, 'member@test.com', 'member');
  assert.equal(inv.ok, true);
  if (!inv.ok) return;
  const accepted = acceptInvitation(inv.value.token, 'password123', 'Mem');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const ctx = resolveSession(accepted.value.token);
  assert.equal(ctx?.orgId, res.value.org.id);
  assert.equal(ctx?.role, 'member');
});

test('role hierarchy', () => {
  assert.equal(hasRole('owner', 'admin'), true);
  assert.equal(hasRole('admin', 'admin'), true);
  assert.equal(hasRole('member', 'admin'), false);
});
