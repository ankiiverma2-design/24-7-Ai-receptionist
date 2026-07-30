/**
 * ElevenLabs adapter for stock voices and custom voice cloning.
 *
 * Uses the REST API over fetch. Cloning here is the provider call only; the
 * platform must have captured and stored consent before invoking it.
 */
import { env, hasElevenLabs } from '../../config/env.ts';
import type {
  CloneVoiceRequest,
  CloneVoiceResult,
  StockVoice,
  TtsProvider,
} from './types.ts';

const API_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsProvider implements TtsProvider {
  readonly name = 'elevenlabs';

  isConfigured(): boolean {
    return hasElevenLabs();
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs is not configured. Set ELEVENLABS_API_KEY.');
    }
  }

  async listStockVoices(): Promise<StockVoice[]> {
    this.assertConfigured();
    const res = await fetch(`${API_BASE}/voices`, {
      headers: { 'xi-api-key': env.elevenLabsApiKey },
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
    };
    return data.voices.map((v) => ({
      providerVoiceId: v.voice_id,
      name: v.name,
      language: v.labels?.language,
    }));
  }

  async cloneVoice(req: CloneVoiceRequest): Promise<CloneVoiceResult> {
    this.assertConfigured();
    const form = new FormData();
    form.append('name', req.name);
    form.append(
      'files',
      new Blob([req.sample], { type: req.sampleMimeType }),
      'sample',
    );
    const res = await fetch(`${API_BASE}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': env.elevenLabsApiKey },
      body: form,
    });
    if (!res.ok) throw new Error(`ElevenLabs clone ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { voice_id: string };
    return { providerVoiceId: data.voice_id };
  }
}

export const elevenLabsProvider = new ElevenLabsProvider();
