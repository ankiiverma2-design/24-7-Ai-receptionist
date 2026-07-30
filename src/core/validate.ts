/**
 * Tiny zero-dependency validation helpers.
 *
 * Replaces a schema library for our needs: enough to safely validate the
 * agent definition and API payloads produced by the no-code builder / API
 * clients. Returns a discriminated result so callers can respond with 400s.
 */

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; errors: string[] };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(...errors: string[]): Err {
  return { ok: false, errors };
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}
