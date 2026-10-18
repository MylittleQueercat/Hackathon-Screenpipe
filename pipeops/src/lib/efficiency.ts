import type { Efficiency } from '../data/schema';

/** Tokens the model read as prompt: uncached input plus cache reads and writes. The three
 *  are disjoint in the harness's usage records, so adding them counts nothing twice.
 *  null when any part is missing: a partial sum would pass for a total. */
export function promptTokens(e: Efficiency | null | undefined): number | null {
  if (!e || e.input === null || e.cacheRead === null || e.cacheWrite === null) return null;
  return e.input + e.cacheRead + e.cacheWrite;
}

/** Everything the run moved through the model: prompt tokens plus output. */
export function totalTokens(e: Efficiency | null | undefined): number | null {
  const p = promptTokens(e);
  return p === null || e?.output == null ? null : p + e.output;
}

/** Share of prompt tokens served from cache. null when unknown or there was no prompt. */
export function cacheHitRate(e: Efficiency | null | undefined): number | null {
  const p = promptTokens(e);
  return p === null || p === 0 || e?.cacheRead == null ? null : e.cacheRead / p;
}

export const fmtCount = (n: number | null | undefined) => {
  if (n == null) return null;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-US');
};
