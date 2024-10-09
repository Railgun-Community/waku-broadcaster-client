import { Chain, SelectedBroadcaster } from '@railgun-community/shared-models';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import {
  cachedFeeUnavailableOrExpired,
  shortenAddress,
} from '../utils/broadcaster-util.js';
import { isDefined } from '../utils/is-defined.js';

const SelectedBroadcasterAscendingFee = (
  a: SelectedBroadcaster,
  b: SelectedBroadcaster,
) => {
  const feeAmount =
    BigInt(a.tokenFee.feePerUnitGas) - BigInt(b.tokenFee.feePerUnitGas);
  if (feeAmount === BigInt(0)) {
    return 0;
  }
  return feeAmount > BigInt(0) ? 1 : -1;
};
export class BroadcasterSearch {
  static findBroadcastersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
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
        `Filtered RAILGUN broadcaster addresses ${
          removedAddresses.length
        }: ${removedAddresses
          .map(address => shortenAddress(address))
          .join(', ')}`,
      );
    }

    const selectedBroadcasters: SelectedBroadcaster[] = [];

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
        const selectedBroadcaster: SelectedBroadcaster = {
          railgunAddress: broadcasterAddress,
          tokenFee: nextCachedFee,
          tokenAddress,
        };
        selectedBroadcasters.push(selectedBroadcaster);
      });
    });

    selectedBroadcasters.sort(
      (a, b) => b.tokenFee.reliability - a.tokenFee.reliability,
    );
    return selectedBroadcasters;
  }

  static findAllBroadcastersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster[]> {
    const broadcasterTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(broadcasterTokenFees)) {
      BroadcasterDebug.log(`No broadcaster fees found for chain ${chain.id}`);
      return undefined;
    }
    const allTokens = Object.keys(broadcasterTokenFees);
    const selectedBroadcasters: SelectedBroadcaster[] = [];
    allTokens.forEach((tokenAddress: string) => {
      const broadcastersForToken = this.findBroadcastersForToken(
        chain,
        tokenAddress,
        useRelayAdapt,
      );
      if (!broadcastersForToken) {
        BroadcasterDebug.log(`No broadcasters found for token ${tokenAddress}`);
        return;
      }
      selectedBroadcasters.push(...broadcastersForToken);
    });
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

    const sortedBroadcasters = broadcastersForToken.sort(
      SelectedBroadcasterAscendingFee,
    );

    return sortedBroadcasters[0];
  }
}
