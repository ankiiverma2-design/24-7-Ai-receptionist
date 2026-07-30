/**
 * Twilio request signature validation (zero-dependency).
 *
 * Twilio signs webhook requests with X-Twilio-Signature: base64(HMAC-SHA1(authToken,
 * fullUrl + sortedConcatenatedParams)). We recompute and compare in constant time.
 *
 * Enforcement is controlled by the caller: validate only when an auth token is
 * configured, so local/dev without Twilio still works.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  // Append params sorted by key, concatenating key then value, with no separators.
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const expected = computeTwilioSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
