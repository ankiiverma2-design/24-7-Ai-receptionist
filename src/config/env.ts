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

  googleClientId: get('GOOGLE_CLIENT_ID'),
  googleClientSecret: get('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: get('GOOGLE_REDIRECT_URI'),

  microsoftClientId: get('MICROSOFT_CLIENT_ID'),
  microsoftClientSecret: get('MICROSOFT_CLIENT_SECRET'),
  microsoftRedirectUri: get('MICROSOFT_REDIRECT_URI'),
  microsoftTenant: get('MICROSOFT_TENANT', 'common'),

  calcomApiKey: get('CALCOM_API_KEY'),
  calcomApiBase: get('CALCOM_API_BASE', 'https://api.cal.com/v1'),

  hubspotClientId: get('HUBSPOT_CLIENT_ID'),
  hubspotClientSecret: get('HUBSPOT_CLIENT_SECRET'),
  hubspotRedirectUri: get('HUBSPOT_REDIRECT_URI'),

  stripeSecretKey: get('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: get('STRIPE_WEBHOOK_SECRET'),
  stripePriceStarter: get('STRIPE_PRICE_STARTER'),
  stripePricePro: get('STRIPE_PRICE_PRO'),
  stripePriceScale: get('STRIPE_PRICE_SCALE'),
  stripeSuccessUrl: get('STRIPE_SUCCESS_URL'),
  stripeCancelUrl: get('STRIPE_CANCEL_URL'),

  resendApiKey: get('RESEND_API_KEY'),
  emailFrom: get('EMAIL_FROM', 'VoxDesk <noreply@localhost>'),

  streamSecret: get('STREAM_SECRET'),
  /** Set to "false" to skip media-stream token checks (local only). */
  streamAuth: get('STREAM_AUTH', 'true') !== 'false',
  rateLimitPerMinute: Number(get('RATE_LIMIT_PER_MINUTE', '120')),

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

export function hasGoogle(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

export function hasMicrosoft(): boolean {
  return Boolean(env.microsoftClientId && env.microsoftClientSecret);
}

export function hasHubSpotOAuth(): boolean {
  return Boolean(env.hubspotClientId && env.hubspotClientSecret);
}

export function hasStripe(): boolean {
  return Boolean(env.stripeSecretKey);
}

export function hasResend(): boolean {
  return Boolean(env.resendApiKey);
}
