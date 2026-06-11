import { describe, expect, test } from 'vitest';
import { checkVariance } from './variance.js';

// Anchor: 1e18 sell (WETH) buys exactly 3000e6 (USDC).
const anchor = { buyPerSellQ96: (3000n * 10n ** 6n * 2n ** 96n) / 10n ** 18n };
const sellAmount = '0xde0b6b3a7640000'; // 1e18
const hex = (v: bigint): string => `0x${v.toString(16)}`;
const EXPECTED = 3000n * 10n ** 6n;

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
    const expected = 7n * 10n ** 25n;
    expect(checkVariance(hex(expected), bigSell, bigAnchor)).toBe('in-band');
    expect(checkVariance(hex((expected * 9500n) / 10000n - 1n), bigSell, bigAnchor)).toBe(
      'below-band',
    );
  });
});
