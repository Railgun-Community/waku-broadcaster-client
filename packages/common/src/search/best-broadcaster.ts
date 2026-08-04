import { Chain, SelectedBroadcaster } from '@railgun-community/shared-models';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import {
  cachedFeeUnavailableOrExpired,
  shortenAddress,
} from '../utils/broadcaster-util.js';
import { isDefined } from '../utils/is-defined.js';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { sessionRankDigest } from '../utils/session-seed.js';

const SelectedBroadcasterAscendingFee = (
  a: SelectedBroadcaster,
  b: SelectedBroadcaster,
) => {
  const feeAmount =
    BigInt(a.tokenFee.feePerUnitGas) - BigInt(b.tokenFee.feePerUnitGas);
  if (feeAmount === BigInt(0)) {
    return b.tokenFee.reliability - a.tokenFee.reliability;
  }
  return feeAmount > BigInt(0) ? 1 : -1;
};

// Internal construction metadata only: the public `SelectedBroadcaster`
// shape is unchanged. `identifier` is used to preserve the per-address
// cache/insertion order during tiered round-robin ordering.
type BroadcasterCandidate = SelectedBroadcaster & {
  identifier: string;
};

const toSelectedBroadcaster = (
  candidate: BroadcasterCandidate,
): SelectedBroadcaster => {
  return {
    railgunAddress: candidate.railgunAddress,
    tokenFee: candidate.tokenFee,
    tokenAddress: candidate.tokenAddress,
  };
};

// Unpredictable within a session (via the random HMAC key) but deterministic
// across repeated calls and cache regeneration. Reliability is intentionally
// excluded so the tier tie-break only considers session seed, chain, token,
// fee, and railgun address. The fee is normalized to its canonical numeric
// string so numerically equal representations (e.g. '100' and '0100') produce
// identical ranks, mirroring the BigInt comparison used for tier grouping.
// The session seed is the HMAC key (not part of the rank input), and the
// returned fixed-width hex digest is compared as a string.
const sessionRankForAddress = (
  chain: Chain,
  tokenAddressLowercase: string,
  feePerUnitGas: string,
  railgunAddress: string,
): string => {
  return sessionRankDigest(
    `${chain.type}:${chain.id}:${tokenAddressLowercase}:${BigInt(feePerUnitGas).toString()}:${railgunAddress}`,
  );
};

// Within one exact fee+reliability tier, order distinct addresses by session
// rank. Tie-breaks fall back to first-appearance (cache insertion) order,
// never lexicographic address order.
const rankAddresses = (
  tierCandidates: BroadcasterCandidate[],
  chain: Chain,
  tokenAddressLowercase: string,
): string[] => {
  const addresses: string[] = [];
  const seenAddresses = new Set<string>();
  tierCandidates.forEach(candidate => {
    if (!seenAddresses.has(candidate.railgunAddress)) {
      seenAddresses.add(candidate.railgunAddress);
      addresses.push(candidate.railgunAddress);
    }
  });

  const feePerUnitGas = tierCandidates[0].tokenFee.feePerUnitGas;

  return addresses
    .map(address => ({
      address,
      rank: sessionRankForAddress(
        chain,
        tokenAddressLowercase,
        feePerUnitGas,
        address,
      ),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank < b.rank ? -1 : 1;
      }
      return addresses.indexOf(a.address) - addresses.indexOf(b.address);
    })
    .map(ranked => ranked.address);
};

// Candidates must be pre-sorted by fee ascending, then reliability descending,
// so exact fee+reliability tiers are contiguous. Within each tier, candidates
// are emitted round-robin: one per address (in session rank order) before a
// second candidate for any address.
const orderCandidatesByTieredRoundRobin = (
  candidates: BroadcasterCandidate[],
  chain: Chain,
  tokenAddressLowercase: string,
): SelectedBroadcaster[] => {
  const orderedBroadcasters: SelectedBroadcaster[] = [];

  let tierStart = 0;
  // Handle tiered batches of candidates with the same fee and reliability
  while (tierStart < candidates.length) {
    const { feePerUnitGas, reliability } = candidates[tierStart].tokenFee;
    const tierFeeAmount = BigInt(feePerUnitGas);

    let tierEnd = tierStart;
    while (tierEnd < candidates.length) {
      const candidate = candidates[tierEnd];
      if (
        BigInt(candidate.tokenFee.feePerUnitGas) !== tierFeeAmount ||
        candidate.tokenFee.reliability !== reliability
      ) {
        break;
      }
      tierEnd++;
    }

    const candidateBatch = candidates.slice(tierStart, tierEnd);
    const addressesByRank = rankAddresses(
      candidateBatch,
      chain,
      tokenAddressLowercase,
    );

    // First round
    const candidatesByAddress = addressesByRank.map(address =>
      candidateBatch.filter(candidate => candidate.railgunAddress === address),
    );

    // One round emits at most one candidate per address, in rank order.
    let remaining = candidateBatch.length;
    let round = 0;
    while (remaining > 0) {
      addressesByRank.forEach((address, addressIndex) => {
        const next = candidatesByAddress[addressIndex][round];
        if (isDefined(next)) {
          orderedBroadcasters.push(toSelectedBroadcaster(next));
          remaining--;
        }
      });
      round++;
    }

    tierStart = tierEnd;
  }

  return orderedBroadcasters;
};

export class BroadcasterSearch {
  static findBroadcastersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    ignoreMissingAuthorizedFee = false,
  ): Optional<SelectedBroadcaster[]> {
    const tokenAddressLowercase = tokenAddress.toLowerCase();
    const broadcasterTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken[tokenAddressLowercase]
        ?.forBroadcaster;
    if (!isDefined(broadcasterTokenFees)) {
      return undefined;
    }

    const unfilteredAddresses = Object.keys(broadcasterTokenFees);
    const broadcasterAddresses = AddressFilter.filter(unfilteredAddresses);
    if (unfilteredAddresses.length !== broadcasterAddresses.length) {
      const removedAddresses = unfilteredAddresses.filter(
        address => !broadcasterAddresses.includes(address),
      );
      BroadcasterDebug.log(
        `Filtered RAILGUN broadcaster addresses ${removedAddresses.length
        }: ${removedAddresses
          .map(address => shortenAddress(address))
          .join(', ')}`,
      );
    }

    const candidates: BroadcasterCandidate[] = [];

    const authorizedFee =
      BroadcasterFeeCache.getAuthorizedFee(tokenAddressLowercase);
    let minFee: bigint | undefined;
    let maxFee: bigint | undefined;

    if (BroadcasterConfig.trustedFeeSigner) {
      if (authorizedFee) {
        const authorizedFeeAmount = BigInt(authorizedFee.feePerUnitGas);
        const varianceLower =
          (authorizedFeeAmount *
            BigInt(
              Math.round(
                BroadcasterConfig.authorizedFeeVariancePercentageLower * 100,
              ),
            )) /
          100n;
        const varianceUpper =
          (authorizedFeeAmount *
            BigInt(
              Math.round(
                BroadcasterConfig.authorizedFeeVariancePercentageUpper * 100,
              ),
            )) /
          100n;
        minFee = authorizedFeeAmount - varianceLower;
        maxFee = authorizedFeeAmount + varianceUpper;
      } else if (!ignoreMissingAuthorizedFee) {
        return [];
      }
    }

    broadcasterAddresses.forEach((broadcasterAddress: string) => {
      const identifiers: string[] = Object.keys(
        broadcasterTokenFees[broadcasterAddress].forIdentifier,
      );
      identifiers.forEach((identifier: string) => {
        const nextCachedFee =
          broadcasterTokenFees[broadcasterAddress].forIdentifier[identifier];
        if (
          cachedFeeUnavailableOrExpired(nextCachedFee, chain, useRelayAdapt)
        ) {
          return;
        }

        if (isDefined(minFee) && isDefined(maxFee)) {
          const incomingFeeAmount = BigInt(nextCachedFee.feePerUnitGas);
          if (incomingFeeAmount < minFee || incomingFeeAmount > maxFee) {
            return;
          }
        }

        const selectedBroadcaster: BroadcasterCandidate = {
          railgunAddress: broadcasterAddress,
          tokenFee: nextCachedFee,
          tokenAddress,
          identifier,
        };
        candidates.push(selectedBroadcaster);
      });
    });

    candidates.sort(SelectedBroadcasterAscendingFee);

    return orderCandidatesByTieredRoundRobin(
      candidates,
      chain,
      tokenAddressLowercase,
    );
  }

  static findAllBroadcastersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
    ignoreMissingAuthorizedFee = false,
  ): Optional<SelectedBroadcaster[]> {
    const broadcasterTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(broadcasterTokenFees)) {
      return undefined;
    }
    const allTokens = Object.keys(broadcasterTokenFees);
    const selectedBroadcasters: SelectedBroadcaster[] = [];
    allTokens.forEach((tokenAddress: string) => {
      const broadcastersForToken = this.findBroadcastersForToken(
        chain,
        tokenAddress,
        useRelayAdapt,
        ignoreMissingAuthorizedFee,
      );
      if (!broadcastersForToken) {
        return;
      }
      selectedBroadcasters.push(...broadcastersForToken);
    });
    selectedBroadcasters.sort(SelectedBroadcasterAscendingFee);
    return selectedBroadcasters;
  }

  static findRandomBroadcasterForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    percentageThreshold: number,
  ): Optional<SelectedBroadcaster> {
    const broadcasterTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(broadcasterTokenFees)) {
      return undefined;
    }

    const broadcastersForToken = this.findBroadcastersForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
    if (!isDefined(broadcastersForToken)) {
      return undefined;
    }
    if (broadcastersForToken.length === 0) {
      return undefined;
    }

    const sortedBroadcasters = broadcastersForToken.sort(
      SelectedBroadcasterAscendingFee,
    );

    const minFee = BigInt(sortedBroadcasters[0].tokenFee.feePerUnitGas);
    const feeThreshold = (minFee * (100n + BigInt(percentageThreshold))) / 100n;
    const eligibleBroadcasters = sortedBroadcasters.filter(
      broadcaster => BigInt(broadcaster.tokenFee.feePerUnitGas) <= feeThreshold,
    );
    const randomIndex = Math.floor(Math.random() * eligibleBroadcasters.length);

    return eligibleBroadcasters[randomIndex];
  }

  static findBestBroadcaster(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster> {
    const broadcasterTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(broadcasterTokenFees)) {
      return undefined;
    }

    const broadcastersForToken = this.findBroadcastersForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
    if (!isDefined(broadcastersForToken)) {
      return undefined;
    }

    // findBroadcastersForToken already orders by fee ascending, then
    // reliability descending, with seeded round-robin ties within each tier.
    // The first entry is the best broadcaster; no further sort is needed.
    return broadcastersForToken[0];
  }
}
