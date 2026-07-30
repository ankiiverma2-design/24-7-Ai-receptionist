/**
 * Environment loading + access (zero-dependency).
 *
 * Loads a local `.env` file if present (simple KEY=VALUE parser), then exposes
 * validated getters. Missing keys degrade gracefully: the server boots and the
 * API/dashboard work; live voice calls require the relevant provider keys.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function get(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: Number(get('PORT', '3000')),
  publicBaseUrl: get('PUBLIC_BASE_URL', 'http://localhost:3000'),
  logLevel: get('LOG_LEVEL', 'info'),

  openaiApiKey: get('OPENAI_API_KEY'),
  openaiRealtimeModel: get('OPENAI_REALTIME_MODEL', 'gpt-4o-realtime-preview'),

  twilioAccountSid: get('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: get('TWILIO_AUTH_TOKEN'),
  twilioCallerId: get('TWILIO_CALLER_ID'),
  /** Set to "false" to disable Twilio signature checks (not recommended). */
  twilioValidateSignature: get('TWILIO_VALIDATE_SIGNATURE', 'true') !== 'false',

  elevenLabsApiKey: get('ELEVENLABS_API_KEY'),

  apiAdminToken: get('API_ADMIN_TOKEN', 'change-me-dev-token'),
};

export function hasOpenAI(): boolean {
  return Boolean(env.openaiApiKey);
}

export function hasTwilio(): boolean {
  return Boolean(env.twilioAccountSid && env.twilioAuthToken);
}

export function hasElevenLabs(): boolean {
  return Boolean(env.elevenLabsApiKey);
}
