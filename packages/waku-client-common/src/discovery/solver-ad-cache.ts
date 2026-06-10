import type { ChainRef, SolverAdMessageData } from '@zeno/shared-models';

export type InsertResult = 'inserted' | 'superseded' | 'stale';

interface CachedAd {
  data: SolverAdMessageData;
  receivedAt: number;
}

export interface AdQueryOpts {
  now: number;
  /** Directional pair the sender wants covered. */
  pair?: { sellToken: string; buyToken: string };
  /** Sender's sell amount; ads demanding a higher minimum are filtered out. */
  sellAmount?: string;
}

export interface SolverAdCache {
  /** Returns how the ad related to the cache; `stale` ads are ignored. */
  insert(data: SolverAdMessageData, receivedAt: number): InsertResult;
  getSolverAds(chain: ChainRef, opts: AdQueryOpts): SolverAdMessageData[];
  getSolverAd(
    chain: ChainRef,
    solverPubkey: string,
    opts: { now: number },
  ): SolverAdMessageData | undefined;
  size(chain: ChainRef): number;
  dispose(): void;
}

const DEFAULT_CAP_PER_CHAIN = 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

const chainKey = (chain: ChainRef): string => `${chain.type}-${chain.id}`;

function evictEarliestExpiry(ads: Map<string, CachedAd>): void {
  let victim: string | undefined;
  let earliest = Number.POSITIVE_INFINITY;
  for (const [pubkey, cached] of ads) {
    if (cached.data.expiry < earliest) {
      earliest = cached.data.expiry;
      victim = pubkey;
    }
  }
  if (victim !== undefined) {
    ads.delete(victim);
  }
}

function matchesQuery(data: SolverAdMessageData, opts: AdQueryOpts): boolean {
  if (data.expiry <= opts.now) {
    return false;
  }
  if (opts.pair === undefined) {
    return true;
  }
  const { sellToken, buyToken } = opts.pair;
  return data.supportedPairs.some(
    (entry) =>
      entry.sellToken === sellToken &&
      entry.buyToken === buyToken &&
      (opts.sellAmount === undefined || BigInt(opts.sellAmount) >= BigInt(entry.minSellAmount)),
  );
}

/**
 * Per-chain cache of verified solver ads (Railgun fee-cache analog). A new ad
 * supersedes the cached one for the same solver only with a strictly newer
 * expiry, so Store redelivery cannot roll a solver's ad backwards. At the
 * per-chain cap the earliest-expiry entry is evicted: a flood of short-lived
 * spam evicts itself before long-lived honest ads.
 */
export function createSolverAdCache(opts?: {
  capPerChain?: number;
  sweepIntervalMs?: number;
}): SolverAdCache {
  const cap = opts?.capPerChain ?? DEFAULT_CAP_PER_CHAIN;
  const chains = new Map<string, Map<string, CachedAd>>();

  const sweep = (): void => {
    const now = Date.now();
    for (const ads of chains.values()) {
      for (const [pubkey, cached] of ads) {
        if (cached.data.expiry <= now) {
          ads.delete(pubkey);
        }
      }
    }
  };
  const sweeper = setInterval(sweep, opts?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);

  return {
    insert: (data, receivedAt) => {
      const key = chainKey(data.chain);
      const ads = chains.get(key) ?? new Map<string, CachedAd>();
      chains.set(key, ads);
      const existing = ads.get(data.solverPubkey);
      if (existing !== undefined && data.expiry <= existing.data.expiry) {
        return 'stale';
      }
      if (existing === undefined && ads.size >= cap) {
        evictEarliestExpiry(ads);
      }
      ads.set(data.solverPubkey, { data, receivedAt });
      return existing === undefined ? 'inserted' : 'superseded';
    },
    getSolverAds: (chain, queryOpts) => {
      const ads = chains.get(chainKey(chain));
      if (ads === undefined) {
        return [];
      }
      return [...ads.values()]
        .filter((cached) => matchesQuery(cached.data, queryOpts))
        .map((cached) => cached.data);
    },
    getSolverAd: (chain, solverPubkey, { now }) => {
      const cached = chains.get(chainKey(chain))?.get(solverPubkey);
      return cached !== undefined && cached.data.expiry > now ? cached.data : undefined;
    },
    size: (chain) => chains.get(chainKey(chain))?.size ?? 0,
    dispose: () => {
      clearInterval(sweeper);
      chains.clear();
    },
  };
}
