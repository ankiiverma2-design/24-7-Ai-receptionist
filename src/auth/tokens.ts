/**
 * Opaque token generation + hashing (zero-dependency).
 *
 * We never store raw session tokens or API keys — only their SHA-256 hash. The
 * raw value is shown to the caller exactly once. Lookups hash the presented
 * token and compare.
 */
import { randomBytes, createHash } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** API keys are shown as "vk_<prefix><secret>"; we store the prefix for display. */
export function generateApiKey(): { token: string; prefix: string; tokenHash: string } {
  const secret = generateToken(24);
  const token = `vk_${secret}`;
  return { token, prefix: token.slice(0, 10), tokenHash: hashToken(token) };
}
