import type { QuoteMessageData } from '@zeno/shared-models';
import type { VarianceOutcome } from './variance.js';

export interface GatedQuote {
  data: QuoteMessageData;
  outcome: VarianceOutcome;
}

const SELECTABLE: ReadonlySet<VarianceOutcome> = new Set(['in-band', 'anchor-unavailable']);

function better(a: GatedQuote, b: GatedQuote): boolean {
  const amountA = BigInt(a.data.buyAmount);
  const amountB = BigInt(b.data.buyAmount);
  if (amountA !== amountB) {
    return amountA > amountB;
  }
  if (a.data.reliability !== b.data.reliability) {
    return a.data.reliability > b.data.reliability;
  }
  return a.data.solverPubkey < b.data.solverPubkey;
}

/**
 * Deterministic selection: highest buyAmount among selectable quotes
 * (in-band, or ungated when no anchor was available); ties by higher
 * reliability, then lexicographic solverPubkey. Out-of-band quotes never win.
 */
export function selectBestQuote(quotes: GatedQuote[]): GatedQuote | undefined {
  let best: GatedQuote | undefined;
  for (const quote of quotes) {
    if (!SELECTABLE.has(quote.outcome)) {
      continue;
    }
    if (best === undefined || better(quote, best)) {
      best = quote;
    }
  }
  return best;
}
