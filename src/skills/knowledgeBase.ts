/**
 * Knowledge base / FAQ skill.
 *
 * Lightweight lexical retrieval over the agent's KB entries. It scores entries
 * by term overlap and returns the best match above a threshold. This grounds
 * answers so the agent doesn't hallucinate; below threshold it returns null so
 * the agent can say "I'm not sure" and offer to take a message / transfer.
 *
 * A production build would swap this for vector/embedding retrieval behind the
 * same function signature.
 */
import type { KnowledgeEntry } from '../core/types.ts';

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'you', 'your', 'i', 'my', 'to',
  'of', 'and', 'or', 'for', 'in', 'on', 'what', 'how', 'can', 'we', 'us', 'me',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface KbMatch {
  entry: KnowledgeEntry;
  score: number;
}

export function searchKnowledgeBase(
  query: string,
  entries: KnowledgeEntry[],
  threshold = 0.2,
): KbMatch | null {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0 || entries.length === 0) return null;

  let best: KbMatch | null = null;
  for (const entry of entries) {
    const eTokens = tokenize(`${entry.question} ${entry.answer}`);
    if (eTokens.length === 0) continue;
    let overlap = 0;
    for (const t of eTokens) if (qTokens.has(t)) overlap++;
    const score = overlap / qTokens.size;
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= threshold ? best : null;
}
