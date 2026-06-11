import { describe, expect, test } from 'vitest';
import { createQuoteCache } from './quote-cache.js';
import { loadEciesFixture, quoteVariant } from './tests/helpers.js';

const base = loadEciesFixture().plaintext;
const NOW = base.validUntil - 15_000;
const pubkey = (byte: string): string => byte.repeat(64);

describe('createQuoteCache', () => {
  test('inserts and reads back a quote', () => {
    const cache = createQuoteCache();
    expect(cache.insert(base)).toBe('inserted');
    expect(cache.getQuotes({ now: NOW })).toEqual([base]);
  });

  test('a later validUntil from the same solver supersedes', () => {
    const cache = createQuoteCache();
    cache.insert(base);
    const newer = quoteVariant(base, {
      validUntil: base.validUntil + 5000,
      buyAmount: '0xb2d05e01',
    });
    expect(cache.insert(newer)).toBe('superseded');
    expect(cache.getQuotes({ now: NOW })).toEqual([newer]);
  });

  test('an equal or older validUntil is stale and ignored', () => {
    const cache = createQuoteCache();
    cache.insert(base);
    expect(cache.insert(quoteVariant(base, { buyAmount: '0x1' }))).toBe('stale');
    expect(cache.getQuotes({ now: NOW })[0]?.buyAmount).toBe(base.buyAmount);
  });

  test('expired quotes are filtered on read', () => {
    const cache = createQuoteCache();
    cache.insert(base);
    expect(cache.getQuotes({ now: base.validUntil + 1 })).toEqual([]);
  });

  test('distinct solvers coexist', () => {
    const cache = createQuoteCache();
    cache.insert(base);
    cache.insert(quoteVariant(base, { solverPubkey: pubkey('b') }));
    expect(cache.getQuotes({ now: NOW })).toHaveLength(2);
  });

  test('at the cap, the earliest-validUntil quote is evicted', () => {
    const cache = createQuoteCache({ cap: 2 });
    cache.insert(
      quoteVariant(base, { solverPubkey: pubkey('a'), validUntil: base.validUntil - 5000 }),
    );
    cache.insert(quoteVariant(base, { solverPubkey: pubkey('b') }));
    cache.insert(quoteVariant(base, { solverPubkey: pubkey('c') }));
    const solvers = cache.getQuotes({ now: NOW }).map((q) => q.solverPubkey);
    expect(solvers).toHaveLength(2);
    expect(solvers).not.toContain(pubkey('a'));
  });
});
