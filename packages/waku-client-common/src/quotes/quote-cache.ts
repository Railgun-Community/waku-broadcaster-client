import type { QuoteMessageData } from '@zeno/shared-models';

export type QuoteInsertResult = 'inserted' | 'superseded' | 'stale';

export interface QuoteCache {
  /** Strict supersede: only a strictly later validUntil replaces a quote. */
  insert(data: QuoteMessageData): QuoteInsertResult;
  getQuotes(opts: { now: number }): QuoteMessageData[];
}

const DEFAULT_CAP = 256;

function evictEarliestValidUntil(quotes: Map<string, QuoteMessageData>): void {
  let victim: string | undefined;
  let earliest = Number.POSITIVE_INFINITY;
  for (const [pubkey, quote] of quotes) {
    if (quote.validUntil < earliest) {
      earliest = quote.validUntil;
      victim = pubkey;
    }
  }
  if (victim !== undefined) {
    quotes.delete(victim);
  }
}

/** Per-intent quote cache keyed by solver pubkey, flood-bounded. */
export function createQuoteCache(opts?: { cap?: number }): QuoteCache {
  const cap = opts?.cap ?? DEFAULT_CAP;
  const quotes = new Map<string, QuoteMessageData>();
  return {
    insert: (data) => {
      const existing = quotes.get(data.solverPubkey);
      if (existing !== undefined && data.validUntil <= existing.validUntil) {
        return 'stale';
      }
      if (existing === undefined && quotes.size >= cap) {
        evictEarliestValidUntil(quotes);
      }
      quotes.set(data.solverPubkey, data);
      return existing === undefined ? 'inserted' : 'superseded';
    },
    getQuotes: ({ now }) => [...quotes.values()].filter((q) => q.validUntil > now),
  };
}
