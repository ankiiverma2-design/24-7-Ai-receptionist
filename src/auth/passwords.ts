/**
 * Password hashing (zero-dependency) using Node's scrypt.
 *
 * Stored format: "salt:hash" where both are hex. scrypt is memory-hard and a
 * reasonable default for password storage without pulling in bcrypt/argon deps.
 * Verification uses a constant-time comparison.
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Basic email shape + password strength checks used at signup. */
export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function isStrongEnough(password: string): boolean {
  return typeof password === 'string' && password.length >= 8;
}
