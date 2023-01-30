import { CachedTokenFee, Chain } from '@railgun-community/shared-models';
import { RelayerFeeCache } from '../fees/relayer-fee-cache';
import { RelayerAddressFilter } from '../filters';
import { RelayerConnectionStatus } from '../models/export-models';
import { cachedFeeExpired } from '../utils/relayer-util';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core';

export class RelayerStatus {
  static getRelayerConnectionStatus(chain: Chain): RelayerConnectionStatus {
    if (WakuRelayerWakuCore.hasError) {
      return RelayerConnectionStatus.Error;
    }
    if (!this.hasRelayerFeesForNetwork(chain)) {
      return RelayerConnectionStatus.Searching;
    }

    const { allRelayerFeesExpired, anyRelayersAvailable } =
      this.getAggregatedInfoForRelayers(chain);
    if (allRelayerFeesExpired) {
      return RelayerConnectionStatus.Disconnected;
    }
    if (!anyRelayersAvailable) {
      return RelayerConnectionStatus.AllUnavailable;
    }

    return RelayerConnectionStatus.Connected;
  }

  private static hasRelayerFeesForNetwork(chain: Chain) {
    const relayerFees = RelayerFeeCache.feesForChain(chain);
    if (!relayerFees || !relayerFees.forToken) {
      return false;
    }

    const cachedTokenRelayers = Object.values(relayerFees.forToken);

    return (
      cachedTokenRelayers.find(tokenRelayerMap => {
        const unfilteredRelayerAddresses = Object.keys(
          tokenRelayerMap.forRelayer,
        );
        const filteredRelayerAddresses = RelayerAddressFilter.filter(
          unfilteredRelayerAddresses,
        );
        return filteredRelayerAddresses.length > 0;
      }) != null
    );
  }

  private static getAggregatedInfoForRelayers(chain: Chain) {
    const relayerFees = RelayerFeeCache.feesForChain(chain);
    if (!relayerFees || !relayerFees.forToken) {
      return { allRelayerFeesExpired: false, anyRelayersAvailable: false };
    }

    const cachedTokenRelayers = Object.values(relayerFees.forToken);

    let allRelayerFeesExpired = true;
    let anyRelayersAvailable = false;

    cachedTokenRelayers.forEach(tokenRelayerMap => {
      const unfilteredRailgunAddresses = Object.keys(
        tokenRelayerMap.forRelayer,
      );
      const filteredRailgunAddresses = RelayerAddressFilter.filter(
        unfilteredRailgunAddresses,
      );
      filteredRailgunAddresses.forEach(railgunAddress => {
        const identifiers: string[] = Object.keys(
          tokenRelayerMap.forRelayer[railgunAddress].forIdentifier,
        );

        // Loops until we hit `return false`.
        identifiers.every(identifier => {
          const tokenFee: CachedTokenFee =
            tokenRelayerMap.forRelayer[railgunAddress].forIdentifier[
              identifier
            ];
          if (cachedFeeExpired(tokenFee.expiration)) {
            return true; // continue
          }

          // Any unexpired means we didn't time out.
          allRelayerFeesExpired = false;

          if (tokenFee.availableWallets > 0) {
            anyRelayersAvailable = true;
            return false; // break
          }
          return true; //continue
        });
      });
    });

    return { allRelayerFeesExpired, anyRelayersAvailable };
  }
}
