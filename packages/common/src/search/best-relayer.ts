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
    const relayerTokenFees =
      BroadcasterFeeCache.feesForChain(chain)?.forToken[tokenAddressLowercase]
        ?.forBroadcaster;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const unfilteredAddresses = Object.keys(relayerTokenFees);
    const relayerAddresses = AddressFilter.filter(unfilteredAddresses);
    if (unfilteredAddresses.length !== relayerAddresses.length) {
      const removedAddresses = unfilteredAddresses.filter(
        address => !relayerAddresses.includes(address),
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

    relayerAddresses.forEach((relayerAddress: string) => {
      const identifiers: string[] = Object.keys(
        relayerTokenFees[relayerAddress].forIdentifier,
      );
      identifiers.forEach((identifier: string) => {
        const nextCachedFee =
          relayerTokenFees[relayerAddress].forIdentifier[identifier];
        if (
          cachedFeeUnavailableOrExpired(nextCachedFee, chain, useRelayAdapt)
        ) {
          return;
        }
        const selectedBroadcaster: SelectedBroadcaster = {
          railgunAddress: relayerAddress,
          tokenFee: nextCachedFee,
          tokenAddress,
        };
        selectedBroadcasters.push(selectedBroadcaster);
      });
    });

    return selectedBroadcasters;
  }

  static findAllBroadcastersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster[]> {
    const relayerTokenFees = BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }
    const allTokens = Object.keys(relayerTokenFees);
    const selectedBroadcasters: SelectedBroadcaster[] = [];
    allTokens.forEach((tokenAddress: string) => {
      const relayersForToken = this.findBroadcastersForToken(
        chain,
        tokenAddress,
        useRelayAdapt,
      );
      if (!relayersForToken) {
        return;
      }
      selectedBroadcasters.push(...relayersForToken);
    });
    return selectedBroadcasters;
  }

  static findRandomBroadcasterForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    percentageThreshold: number,
  ): Optional<SelectedBroadcaster> {
    const relayerTokenFees = BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const relayersForToken = this.findBroadcastersForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
    if (!isDefined(relayersForToken)) {
      return undefined;
    }
    if (relayersForToken.length === 0) {
      return undefined;
    }

    const sortedBroadcasters = relayersForToken.sort(
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
    const relayerTokenFees = BroadcasterFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const relayersForToken = this.findBroadcastersForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
    if (!isDefined(relayersForToken)) {
      return undefined;
    }

    const sortedBroadcasters = relayersForToken.sort(
      SelectedBroadcasterAscendingFee,
    );

    return sortedBroadcasters[0];
  }
}
