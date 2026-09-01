/**
 * LiveKit / self-hosted realtime path (scaffold).
 *
 * The platform's TelephonyProvider + RealtimeSessionConfig interfaces are the
 * extension points. A production LiveKit SIP + STT/TTS pipeline would implement
 * those contracts and be selected via env (e.g. TELEPHONY_PROVIDER=livekit).
 * Benchmark latency against the OpenAI Realtime path before switching.
 */
import type { TelephonyProvider } from '../telephony/types.ts';

export class LiveKitTelephonyProvider implements TelephonyProvider {
  readonly name = 'livekit';
  isConfigured(): boolean {
    return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY);
  }
  async searchNumbers(): Promise<never> {
    throw new Error('LiveKit number search is not implemented; keep using Twilio for PSTN DIDs.');
  }
  async provisionNumber(): Promise<never> {
    throw new Error('LiveKit number provisioning is not implemented; keep using Twilio for PSTN DIDs.');
  }
  async startOutboundCall(): Promise<never> {
    throw new Error('LiveKit outbound is not wired; use the Twilio telephony provider.');
  }
}

export const liveKitTelephony = new LiveKitTelephonyProvider();
