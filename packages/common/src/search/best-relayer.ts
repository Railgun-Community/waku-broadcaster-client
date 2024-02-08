import { Chain, SelectedRelayer } from '@railgun-community/shared-models';
import { RelayerFeeCache } from '../fees/relayer-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import {
  cachedFeeUnavailableOrExpired,
  shortenAddress,
} from '../utils/relayer-util.js';
import { isDefined } from '../utils/is-defined.js';

const SelectedRelayerAscendingFee = (a: SelectedRelayer, b: SelectedRelayer) => {
  const feeAmount = BigInt(a.tokenFee.feePerUnitGas) - BigInt(b.tokenFee.feePerUnitGas);
  if (feeAmount === BigInt(0)) {
    return 0;
  }
  return feeAmount > BigInt(0) ? 1 : -1;
}
export class RelayerSearch {

  static findRelayersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer[]> {
    const tokenAddressLowercase = tokenAddress.toLowerCase();
    const relayerTokenFees =
      RelayerFeeCache.feesForChain(chain)?.forToken[tokenAddressLowercase]
        ?.forRelayer;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const unfilteredAddresses = Object.keys(relayerTokenFees);
    const relayerAddresses = AddressFilter.filter(unfilteredAddresses);
    if (unfilteredAddresses.length !== relayerAddresses.length) {
      const removedAddresses = unfilteredAddresses.filter(
        address => !relayerAddresses.includes(address),
      );
      RelayerDebug.log(
        `Filtered RAILGUN relayer addresses ${removedAddresses.length
        }: ${removedAddresses
          .map(address => shortenAddress(address))
          .join(', ')}`,
      );
    }

    const selectedRelayers: SelectedRelayer[] = [];

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
        const selectedRelayer: SelectedRelayer = {
          railgunAddress: relayerAddress,
          tokenFee: nextCachedFee,
          tokenAddress,
        };
        selectedRelayers.push(selectedRelayer);
      });
    });

    return selectedRelayers;
  }

  static findAllRelayersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer[]> {

    const relayerTokenFees =
      RelayerFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }
    const allTokens = Object.keys(relayerTokenFees);
    const selectedRelayers: SelectedRelayer[] = [];
    allTokens.forEach((tokenAddress: string) => {
      const relayersForToken = this.findRelayersForToken(chain, tokenAddress, useRelayAdapt);
      if (!relayersForToken) {
        return;
      }
      selectedRelayers.push(...relayersForToken);
    });
    return selectedRelayers;
  }

  static findRandomRelayerForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    percentageThreshold: number,
  ): Optional<SelectedRelayer> {
    const relayerTokenFees =
      RelayerFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const relayersForToken = this.findRelayersForToken(chain, tokenAddress, useRelayAdapt);
    if (!isDefined(relayersForToken)) {
      return undefined;
    }
    if (relayersForToken.length === 0) {
      return undefined;
    }

    const sortedRelayers = relayersForToken.sort(SelectedRelayerAscendingFee);

    const minFee = BigInt(sortedRelayers[0].tokenFee.feePerUnitGas);
    const feeThreshold = (minFee * (100n + BigInt(percentageThreshold))) / 100n;
    const eligibleRelayers = sortedRelayers.filter(relayer => BigInt(relayer.tokenFee.feePerUnitGas) <= feeThreshold);
    const randomIndex = Math.floor(Math.random() * eligibleRelayers.length);

    return eligibleRelayers[randomIndex];
  }

  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer> {
    const relayerTokenFees = RelayerFeeCache.feesForChain(chain)?.forToken;
    if (!isDefined(relayerTokenFees)) {
      return undefined;
    }

    const relayersForToken = this.findRelayersForToken(chain, tokenAddress, useRelayAdapt);
    if (!isDefined(relayersForToken)) {
      return undefined;
    }

    const sortedRelayers = relayersForToken.sort(SelectedRelayerAscendingFee);

    return sortedRelayers[0];
  }
}
