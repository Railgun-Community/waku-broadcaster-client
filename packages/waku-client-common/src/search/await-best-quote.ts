import { QUOTE_WAIT_TIMEOUT_MS, type EciesEnvelope } from '@zeno/shared-models';
import { createQuoteCache } from '../quotes/quote-cache.js';
import { decryptQuoteEnvelope } from '../quotes/quote-decrypt.js';
import { checkVariance, type AnchorPrice, type VarianceAnchor } from './variance.js';
import { selectBestQuote, type GatedQuote } from './best-quote.js';

export type AwaitQuoteErrorKind = 'no-quotes' | 'all-rejected';

/** Rejection from {@link awaitBestQuote}; carries the window that elapsed. */
export class AwaitQuoteError extends Error {
  override readonly name = 'AwaitQuoteError';
  readonly kind: AwaitQuoteErrorKind;
  constructor(kind: AwaitQuoteErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** The slice of an IntentHandle this layer needs (structural, test-friendly). */
export interface QuoteSource {
  intentId: string;
  data: { sellAmount: string; sellToken: string; buyToken: string };
  identity: { dhSecret(): Uint8Array };
  envelopes(): AsyncIterable<EciesEnvelope>;
}

/**
 * Collects quotes from the handle's envelope stream for the full window,
 * decrypting and validating each (wrong-intent and undecryptable envelopes
 * are dropped), then gates against the anchor and selects deterministically.
 *
 * The anchor is fetched once at selection time; a missing or failing anchor
 * degrades to amount-only selection (`anchor-unavailable`), per the design's
 * RPC soft-fallback and the testnet variance-off mode.
 *
 * @throws AwaitQuoteError `no-quotes` when nothing valid arrived,
 *   `all-rejected` when every quote fell outside the variance band.
 */
export async function awaitBestQuote(
  handle: QuoteSource,
  opts: { anchor?: VarianceAnchor; timeoutMs?: number } = {},
): Promise<GatedQuote> {
  const cache = createQuoteCache();
  const secret = handle.identity.dhSecret();
  let collecting = true;

  const collect = async (): Promise<void> => {
    for await (const envelope of handle.envelopes()) {
      if (!collecting) {
        return;
      }
      const decrypted = decryptQuoteEnvelope(envelope, secret, { now: Date.now() });
      if (decrypted.ok && decrypted.value.intentId === handle.intentId) {
        cache.insert(decrypted.value);
      }
    }
  };
  void collect();

  await new Promise<void>((resolve) => {
    setTimeout(resolve, opts.timeoutMs ?? QUOTE_WAIT_TIMEOUT_MS);
  });
  collecting = false;

  const quotes = cache.getQuotes({ now: Date.now() });
  if (quotes.length === 0) {
    throw new AwaitQuoteError('no-quotes', 'no valid quotes arrived within the window');
  }

  let anchorPrice: AnchorPrice | undefined;
  if (opts.anchor !== undefined) {
    anchorPrice = await opts
      .anchor({
        sellToken: handle.data.sellToken,
        buyToken: handle.data.buyToken,
      })
      .catch(() => undefined);
  }

  const gated = quotes.map((data) => ({
    data,
    outcome: checkVariance(data.buyAmount, handle.data.sellAmount, anchorPrice),
  }));
  const best = selectBestQuote(gated);
  if (best === undefined) {
    throw new AwaitQuoteError('all-rejected', 'every quote fell outside the variance band');
  }
  return best;
}
