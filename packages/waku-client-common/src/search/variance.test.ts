import { describe, expect, test } from 'vitest';
import { checkVariance } from './variance.js';

// sellAmount = 2^96 makes expected = buyPerSellQ96 exactly (no Q96 truncation),
// so the band boundaries are exact integers and pinnable to the unit.
const anchor = { buyPerSellQ96: 3_000_000_000n };
const sellAmount = `0x${(2n ** 96n).toString(16)}`;
const hex = (v: bigint): string => `0x${v.toString(16)}`;
const EXPECTED = 3_000_000_000n;

describe('checkVariance', () => {
  test.each([
    ['exactly the anchor', EXPECTED, 'in-band'],
    ['exactly the lower band (0.95x)', (EXPECTED * 9500n) / 10000n, 'in-band'],
    ['exactly the upper band (1.10x)', (EXPECTED * 11000n) / 10000n, 'in-band'],
    ['one unit below the lower band', (EXPECTED * 9500n) / 10000n - 1n, 'below-band'],
    ['one unit above the upper band', (EXPECTED * 11000n) / 10000n + 1n, 'above-band'],
  ])('%s is %s', (_label, buyAmount, outcome) => {
    expect(checkVariance(hex(buyAmount), sellAmount, anchor)).toBe(outcome);
  });

  test('no anchor reports anchor-unavailable (testnet mode and RPC soft-fallback)', () => {
    expect(checkVariance(hex(EXPECTED), sellAmount, undefined)).toBe('anchor-unavailable');
  });

  test('integer math only: no precision loss on large amounts', () => {
    const bigSell = hex(10n ** 27n);
    const bigAnchor = { buyPerSellQ96: (7n * 10n ** 25n * 2n ** 96n) / 10n ** 27n };
    const expected = (10n ** 27n * bigAnchor.buyPerSellQ96) / 2n ** 96n;
    expect(checkVariance(hex(expected), bigSell, bigAnchor)).toBe('in-band');
    expect(checkVariance(hex((expected * 9500n) / 10000n - 1n), bigSell, bigAnchor)).toBe(
      'below-band',
    );
  });
});
