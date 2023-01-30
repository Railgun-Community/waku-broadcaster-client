import { BigNumber } from '@ethersproject/bignumber';
import { Chain, SelectedRelayer } from '@railgun-community/shared-models';
import { RelayerFeeCache } from '../fees/relayer-fee-cache';
import { AddressFilter } from '../filters/address-filter';
import { RelayerDebug } from '../utils/relayer-debug';
import { cachedFeeUnavailableOrExpired } from '../utils/relayer-util';

export class RelayerSearch {
  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer> {
    const tokenAddressLowercase = tokenAddress.toLowerCase();
    const relayerTokenFees =
      RelayerFeeCache.feesForChain(chain)?.forToken[tokenAddressLowercase]
        ?.forRelayer;
    if (!relayerTokenFees) {
      return undefined;
    }

    const unfilteredAddresses = Object.keys(relayerTokenFees);
    const relayerAddresses = AddressFilter.filter(unfilteredAddresses);
    if (unfilteredAddresses.length !== relayerAddresses.length) {
      RelayerDebug.log(
        `Removed ${
          unfilteredAddresses.length - relayerAddresses.length
        } railgun relayer addresses.`,
      );
    }

    let bestRelayerAddress: Optional<string>;
    let bestRelayerIdentifier: Optional<string>;

    let minFee: Optional<BigNumber>;

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
        const fee = BigNumber.from(nextCachedFee.feePerUnitGas);
        if (!minFee || fee.lt(minFee)) {
          minFee = fee;
          bestRelayerAddress = relayerAddress;
          bestRelayerIdentifier = identifier;
        }
      });
    });

    if (!bestRelayerAddress || !bestRelayerIdentifier) {
      return undefined;
    }

    const selectedRelayer: SelectedRelayer = {
      railgunAddress: bestRelayerAddress,
      tokenFee:
        relayerTokenFees[bestRelayerAddress].forIdentifier[
          bestRelayerIdentifier
        ],
      tokenAddress,
    };

    return selectedRelayer;
  }
}
