import { describe, expect, test } from 'vitest';
import { selectBestQuote, type GatedQuote } from './best-quote.js';
import { loadEciesFixture, quoteVariant } from '../quotes/tests/helpers.js';

const base = loadEciesFixture().plaintext;
const pubkey = (byte: string): string => byte.repeat(64);

const gated = (
  overrides: Parameters<typeof quoteVariant>[1],
  outcome: GatedQuote['outcome'],
): GatedQuote => ({
  data: quoteVariant(base, overrides),
  outcome,
});

describe('selectBestQuote', () => {
  test('the highest in-band buyAmount wins', () => {
    const best = selectBestQuote([
      gated({ solverPubkey: pubkey('a'), buyAmount: '0xb2d05e00' }, 'in-band'),
      gated({ solverPubkey: pubkey('b'), buyAmount: '0xb2d05e01' }, 'in-band'),
    ]);
    expect(best?.data.solverPubkey).toBe(pubkey('b'));
  });

  test('out-of-band quotes never win even with a higher amount', () => {
    const best = selectBestQuote([
      gated({ solverPubkey: pubkey('a'), buyAmount: '0xb2d05e00' }, 'in-band'),
      gated({ solverPubkey: pubkey('b'), buyAmount: '0xffffffffff' }, 'above-band'),
    ]);
    expect(best?.data.solverPubkey).toBe(pubkey('a'));
  });

  test('anchor-unavailable quotes are selectable (soft fallback)', () => {
    const best = selectBestQuote([
      gated({ solverPubkey: pubkey('a'), buyAmount: '0xb2d05e01' }, 'anchor-unavailable'),
      gated({ solverPubkey: pubkey('b'), buyAmount: '0xb2d05e00' }, 'anchor-unavailable'),
    ]);
    expect(best?.data.solverPubkey).toBe(pubkey('a'));
  });

  test('amount ties break by higher reliability', () => {
    const best = selectBestQuote([
      gated({ solverPubkey: pubkey('a'), reliability: 9000 }, 'in-band'),
      gated({ solverPubkey: pubkey('b'), reliability: 9900 }, 'in-band'),
    ]);
    expect(best?.data.solverPubkey).toBe(pubkey('b'));
  });

  test('full ties break by lexicographic solverPubkey (deterministic)', () => {
    const best = selectBestQuote([
      gated({ solverPubkey: pubkey('c') }, 'in-band'),
      gated({ solverPubkey: pubkey('a') }, 'in-band'),
      gated({ solverPubkey: pubkey('b') }, 'in-band'),
    ]);
    expect(best?.data.solverPubkey).toBe(pubkey('a'));
  });

  test('returns undefined when nothing is selectable', () => {
    expect(selectBestQuote([])).toBeUndefined();
    expect(selectBestQuote([gated({}, 'below-band')])).toBeUndefined();
  });
});
