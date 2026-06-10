import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSolverAdCache } from './solver-ad-cache.js';
import { adVariant, FIXTURE_NOW, loadSolverAdFixture } from './tests/helpers.js';

const fixture = loadSolverAdFixture();
const chain = fixture.data.chain;
const NOW = FIXTURE_NOW;

const pubkey = (byte: string): string => byte.repeat(64);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSolverAdCache', () => {
  test('inserts a new solver and returns it on read', () => {
    const cache = createSolverAdCache();
    expect(cache.insert(fixture.data, NOW)).toBe('inserted');
    expect(cache.getSolverAds(chain, { now: NOW })).toEqual([fixture.data]);
    cache.dispose();
  });

  test('a newer ad for the same solver supersedes the cached one', () => {
    const cache = createSolverAdCache();
    cache.insert(fixture.data, NOW);
    const newer = adVariant(fixture, { expiry: fixture.data.expiry + 15_000 });
    expect(cache.insert(newer, NOW + 15_000)).toBe('superseded');
    expect(cache.getSolverAd(chain, fixture.data.solverPubkey, { now: NOW })?.expiry).toBe(
      newer.expiry,
    );
    cache.dispose();
  });

  test('an out-of-order redelivery with older expiry is stale and ignored', () => {
    const cache = createSolverAdCache();
    const newer = adVariant(fixture, { expiry: fixture.data.expiry + 15_000 });
    cache.insert(newer, NOW);
    expect(cache.insert(fixture.data, NOW + 1)).toBe('stale');
    expect(cache.getSolverAd(chain, fixture.data.solverPubkey, { now: NOW })?.expiry).toBe(
      newer.expiry,
    );
    cache.dispose();
  });

  test('reads filter out expired ads lazily', () => {
    const cache = createSolverAdCache();
    cache.insert(fixture.data, NOW);
    expect(cache.getSolverAds(chain, { now: fixture.data.expiry + 1 })).toEqual([]);
    cache.dispose();
  });

  test('the periodic sweep evicts expired entries', () => {
    const cache = createSolverAdCache({ sweepIntervalMs: 60_000 });
    cache.insert(fixture.data, NOW);
    expect(cache.size(chain)).toBe(1);
    vi.setSystemTime(fixture.data.expiry + 1);
    vi.advanceTimersByTime(60_000);
    expect(cache.size(chain)).toBe(0);
    cache.dispose();
  });

  test('at the per-chain cap, the earliest-expiry entry is evicted', () => {
    const cache = createSolverAdCache({ capPerChain: 2 });
    const shortLived = adVariant(fixture, {
      solverPubkey: pubkey('a'),
      expiry: fixture.data.expiry - 100_000,
    });
    const longLived = adVariant(fixture, { solverPubkey: pubkey('b') });
    const newcomer = adVariant(fixture, { solverPubkey: pubkey('c') });
    cache.insert(shortLived, NOW);
    cache.insert(longLived, NOW);
    expect(cache.insert(newcomer, NOW)).toBe('inserted');
    expect(cache.size(chain)).toBe(2);
    expect(cache.getSolverAd(chain, pubkey('a'), { now: NOW })).toBeUndefined();
    expect(cache.getSolverAd(chain, pubkey('c'), { now: NOW })).toBeDefined();
    cache.dispose();
  });

  test('chains are isolated', () => {
    const cache = createSolverAdCache();
    cache.insert(fixture.data, NOW);
    expect(cache.getSolverAds({ id: 137, type: 0 }, { now: NOW })).toEqual([]);
    cache.dispose();
  });

  test('filters by directional pair support', () => {
    const cache = createSolverAdCache();
    cache.insert(fixture.data, NOW);
    const supported = fixture.data.supportedPairs[0];
    if (supported === undefined) throw new Error('fixture has no pairs');
    const match = cache.getSolverAds(chain, {
      now: NOW,
      pair: { sellToken: supported.sellToken, buyToken: supported.buyToken },
    });
    expect(match).toHaveLength(1);
    const reversedOnlyIfListed = cache.getSolverAds(chain, {
      now: NOW,
      pair: { sellToken: '0x' + '11'.repeat(20), buyToken: supported.buyToken },
    });
    expect(reversedOnlyIfListed).toEqual([]);
    cache.dispose();
  });

  test('filters by the sender sell amount against the advertised minimum', () => {
    const cache = createSolverAdCache();
    cache.insert(fixture.data, NOW);
    const supported = fixture.data.supportedPairs[0];
    if (supported === undefined) throw new Error('fixture has no pairs');
    const pair = { sellToken: supported.sellToken, buyToken: supported.buyToken };
    expect(
      cache.getSolverAds(chain, { now: NOW, pair, sellAmount: supported.minSellAmount }),
    ).toHaveLength(1);
    expect(cache.getSolverAds(chain, { now: NOW, pair, sellAmount: '0x1' })).toEqual([]);
    cache.dispose();
  });

  test('dispose stops the sweep timer', () => {
    const cache = createSolverAdCache({ sweepIntervalMs: 60_000 });
    cache.insert(fixture.data, NOW);
    cache.dispose();
    vi.setSystemTime(fixture.data.expiry + 1);
    expect(() => vi.advanceTimersByTime(600_000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
