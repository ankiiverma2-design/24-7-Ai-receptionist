/**
 * Realtime voice provider abstraction (STT + LLM + TTS in one streaming loop).
 *
 * The orchestrator uses this to build a provider-specific session and to map
 * platform tools to the provider's function-calling format. OpenAI Realtime is
 * the first implementation; a LiveKit/Deepgram+TTS pipeline could implement the
 * same shape later.
 */

/** A tool the model can call mid-conversation (function calling). */
export interface RealtimeTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface RealtimeSessionConfig {
  model: string;
  /** System/persona instructions. */
  instructions: string;
  /** Provider voice id (stock or cloned). */
  voice: string;
  /** BCP-47 default language hint. */
  language?: string;
  tools: RealtimeTool[];
  /** Audio format expected by the telephony bridge. */
  inputAudioFormat: 'g711_ulaw' | 'pcm16';
  outputAudioFormat: 'g711_ulaw' | 'pcm16';
}
