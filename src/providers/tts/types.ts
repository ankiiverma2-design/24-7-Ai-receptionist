/**
 * TTS + voice-cloning provider abstraction.
 *
 * Voice cloning is gated on consent at the API layer (see api/routes/voices.ts);
 * this adapter only performs the provider operation.
 */

export interface CloneVoiceRequest {
  name: string;
  /** Audio sample bytes (wav/mp3) of the voice to clone. */
  sample: Buffer;
  sampleMimeType: string;
}

export interface CloneVoiceResult {
  providerVoiceId: string;
}

export interface StockVoice {
  providerVoiceId: string;
  name: string;
  language?: string;
}

export interface TtsProvider {
  readonly name: string;
  isConfigured(): boolean;
  listStockVoices(): Promise<StockVoice[]>;
  cloneVoice(req: CloneVoiceRequest): Promise<CloneVoiceResult>;
}
