/**
 * LLM router.
 *
 * Selects a model per task and provides a simple chat/JSON completion helper
 * used for non-realtime work: post-call summarization, structured lead
 * extraction, lead scoring. The realtime conversation itself runs through the
 * OpenAI Realtime adapter; this covers everything around it.
 *
 * Model tiering lets simple tasks use a cheaper/faster model while complex
 * reasoning can escalate — a lever for unit economics at scale.
 */
import { env, hasOpenAI } from '../../config/env.ts';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export type Task = 'summarize' | 'extract' | 'score' | 'reason';

function modelForTask(task: Task): string {
  switch (task) {
    case 'reason':
      return 'gpt-4o';
    case 'extract':
    case 'summarize':
    case 'score':
    default:
      return 'gpt-4o-mini';
  }
}

export interface CompletionOptions {
  task: Task;
  system: string;
  user: string;
  /** If true, instructs the model to return strict JSON. */
  json?: boolean;
}

export async function complete(opts: CompletionOptions): Promise<string> {
  if (!hasOpenAI()) {
    throw new Error('OpenAI is not configured. Set OPENAI_API_KEY.');
  }
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelForTask(opts.task),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      temperature: opts.task === 'reason' ? 0.4 : 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}
