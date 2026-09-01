/**
 * Short-lived HMAC token binding a Twilio media-stream upgrade to the
 * agentId + callId issued by the voice webhook. Prevents anonymous clients
 * from opening /telephony/media with arbitrary ids.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.ts';

function secret(): string {
  return env.streamSecret || env.apiAdminToken;
}

export function issueStreamToken(agentId: string, callId: string, ttlSec = 600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ agentId, callId, exp })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyStreamToken(token: string | undefined, agentId: string, callId: string): boolean {
  if (!env.streamAuth) return true;
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      agentId: string;
      callId: string;
      exp: number;
    };
    if (data.exp < Math.floor(Date.now() / 1000)) return false;
    return data.agentId === agentId && data.callId === callId;
  } catch {
    return false;
  }
}
