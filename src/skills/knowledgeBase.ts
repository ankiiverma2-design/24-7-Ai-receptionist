/**
 * Knowledge base / FAQ skill.
 *
 * Vector retrieval: TF-IDF cosine similarity over the agent's KB entries.
 * Falls back to lexical term-overlap. Below threshold returns null so the
 * agent can refuse rather than fabricate.
 *
 * Optional: when OPENAI_API_KEY is set and VOXDESK_KB_EMBEDDINGS=openai,
 * entries can be scored with embedding cosine (async helper).
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

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Cosine similarity of two sparse TF vectors, IDF-weighted by document frequency. */
export function tfidfCosine(query: string, documents: string[]): number[] {
  const qTokens = tokenize(query);
  const docs = documents.map(tokenize);
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = Math.max(docs.length, 1);
  const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const qtf = termFreq(qTokens);
  const qVec = new Map<string, number>();
  for (const [t, f] of qtf) qVec.set(t, (f / qTokens.length) * idf(t));

  const qNorm = Math.sqrt([...qVec.values()].reduce((a, v) => a + v * v, 0)) || 1;

  return docs.map((d) => {
    if (d.length === 0) return 0;
    const dtf = termFreq(d);
    let dot = 0;
    let dsq = 0;
    for (const [t, f] of dtf) {
      const w = (f / d.length) * idf(t);
      dsq += w * w;
      const qw = qVec.get(t);
      if (qw) dot += qw * w;
    }
    const dNorm = Math.sqrt(dsq) || 1;
    return dot / (qNorm * dNorm);
  });
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function searchKnowledgeBase(
  query: string,
  entries: KnowledgeEntry[],
  threshold = 0.2,
): KbMatch | null {
  if (!query.trim() || entries.length === 0) return null;

  const docs = entries.map((e) => `${e.question} ${e.answer}`);
  const scores = tfidfCosine(query, docs);
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }

  // Lexical overlap as a floor so short FAQ questions still match.
  const qTokens = new Set(tokenize(query));
  if (qTokens.size > 0) {
    for (let i = 0; i < entries.length; i++) {
      const eTokens = tokenize(`${entries[i].question} ${entries[i].answer}`);
      let overlap = 0;
      for (const t of eTokens) if (qTokens.has(t)) overlap++;
      const lexical = overlap / qTokens.size;
      if (lexical > bestScore) {
        bestScore = lexical;
        bestIdx = i;
      }
    }
  }

  if (bestIdx < 0 || bestScore < threshold) return null;
  return { entry: entries[bestIdx], score: bestScore };
}
