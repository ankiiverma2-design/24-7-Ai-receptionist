/**
 * Telephony provider abstraction.
 *
 * All call-control and number operations go through this interface so the
 * platform is not coupled to Twilio. A future LiveKit/SIP or managed-voice
 * provider implements the same contract.
 */

export interface AvailableNumber {
  e164: string;
  country: string;
  type: 'local' | 'tollfree';
  monthlyCost?: number;
}

export interface ProvisionResult {
  e164: string;
  providerRef: string;
}

export interface OutboundCallRequest {
  to: string;
  from: string;
  /** URL Twilio requests for call instructions (TwiML). */
  answerUrl: string;
}

export interface TelephonyProvider {
  readonly name: string;
  isConfigured(): boolean;

  /** Search purchasable numbers. */
  searchNumbers(country: string, type: 'local' | 'tollfree'): Promise<AvailableNumber[]>;

  /** Purchase a number and point it at this platform. */
  provisionNumber(e164: string, voiceWebhookUrl: string): Promise<ProvisionResult>;

  /** Start an outbound call. */
  startOutboundCall(req: OutboundCallRequest): Promise<{ providerRef: string }>;
}
