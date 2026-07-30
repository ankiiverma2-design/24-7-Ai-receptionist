/**
 * Twilio telephony adapter.
 *
 * Uses Twilio's REST API directly over fetch (no SDK dependency) so the build
 * stays lean. All calls are guarded by isConfigured(); when credentials are
 * absent the methods throw a clear, actionable error rather than failing
 * cryptically.
 */
import { env, hasTwilio } from '../../config/env.ts';
import type {
  AvailableNumber,
  OutboundCallRequest,
  ProvisionResult,
  TelephonyProvider,
} from './types.ts';

const API_BASE = 'https://api.twilio.com/2010-04-01';

function authHeader(): string {
  const token = Buffer.from(
    `${env.twilioAccountSid}:${env.twilioAuthToken}`,
  ).toString('base64');
  return `Basic ${token}`;
}

async function twilioRequest(path: string, method: 'GET' | 'POST', body?: Record<string, string>) {
  const url = `${API_BASE}/Accounts/${env.twilioAccountSid}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio API ${res.status}: ${text}`);
  }
  return res.json();
}

export class TwilioProvider implements TelephonyProvider {
  readonly name = 'twilio';

  isConfigured(): boolean {
    return hasTwilio();
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
      );
    }
  }

  async searchNumbers(
    country: string,
    type: 'local' | 'tollfree',
  ): Promise<AvailableNumber[]> {
    this.assertConfigured();
    const kind = type === 'tollfree' ? 'TollFree' : 'Local';
    const data = (await twilioRequest(
      `/AvailablePhoneNumbers/${country}/${kind}.json?PageSize=10`,
      'GET',
    )) as { available_phone_numbers?: Array<{ phone_number: string }> };
    return (data.available_phone_numbers ?? []).map((n) => ({
      e164: n.phone_number,
      country,
      type,
    }));
  }

  async provisionNumber(e164: string, voiceWebhookUrl: string): Promise<ProvisionResult> {
    this.assertConfigured();
    const data = (await twilioRequest('/IncomingPhoneNumbers.json', 'POST', {
      PhoneNumber: e164,
      VoiceUrl: voiceWebhookUrl,
      VoiceMethod: 'POST',
    })) as { sid: string; phone_number: string };
    return { e164: data.phone_number, providerRef: data.sid };
  }

  async startOutboundCall(req: OutboundCallRequest): Promise<{ providerRef: string }> {
    this.assertConfigured();
    const data = (await twilioRequest('/Calls.json', 'POST', {
      To: req.to,
      From: req.from,
      Url: req.answerUrl,
      Method: 'POST',
    })) as { sid: string };
    return { providerRef: data.sid };
  }
}

export const twilioProvider = new TwilioProvider();
