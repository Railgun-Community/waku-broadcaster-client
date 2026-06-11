import { VARIANCE_BAND_LOWER_BPS, VARIANCE_BAND_UPPER_BPS } from '@zeno/shared-models';

/** Anchor price as buyToken-per-sellToken in Q96 fixed point. */
export interface AnchorPrice {
  buyPerSellQ96: bigint;
}

/**
 * Anchor source seam. The concrete Uniswap v3 TWAP implementation lands with
 * a provider in Phase 8 (open-questions.md, Q-TWAP); tests and testnet inject
 * fixtures or omit the anchor entirely.
 */
export type VarianceAnchor = (pair: {
  sellToken: string;
  buyToken: string;
}) => Promise<AnchorPrice>;

export type VarianceOutcome = 'in-band' | 'below-band' | 'above-band' | 'anchor-unavailable';

const Q96 = 2n ** 96n;

/**
 * Gates a quoted buyAmount against the anchor: accept within
 * [0.95x, 1.10x] of the expected output (integer math, bands in bps from
 * shared-models). No anchor means the gate is inactive (testnet mode or RPC
 * soft-fallback) and the caller selects by amount alone.
 */
export function checkVariance(
  buyAmountHex: string,
  sellAmountHex: string,
  anchor: AnchorPrice | undefined,
): VarianceOutcome {
  if (anchor === undefined) {
    return 'anchor-unavailable';
  }
  const buyAmount = BigInt(buyAmountHex);
  const expected = (BigInt(sellAmountHex) * anchor.buyPerSellQ96) / Q96;
  if (buyAmount * 10_000n < expected * BigInt(VARIANCE_BAND_LOWER_BPS)) {
    return 'below-band';
  }
  if (buyAmount * 10_000n > expected * BigInt(VARIANCE_BAND_UPPER_BPS)) {
    return 'above-band';
  }
  return 'in-band';
}
