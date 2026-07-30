import { randomUUID, randomBytes } from 'node:crypto';

/** Prefixed, human-scannable IDs (e.g. "agt_a1b2c3d4e5f6g7h8"). */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export function newUuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
