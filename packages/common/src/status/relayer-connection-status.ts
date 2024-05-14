import {
  CachedTokenFee,
  Chain,
  RelayerConnectionStatus,
} from '@railgun-community/shared-models';
import { RelayerFeeCache } from '../fees/broadcaster-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { cachedFeeExpired } from '../utils/broadcaster-util.js';
import { WakuRelayerWakuCore } from '../waku/waku-broadcaster-waku-core.js';
import { isDefined } from '../utils/is-defined.js';

export class RelayerStatus {
  static getRelayerConnectionStatus(chain: Chain): RelayerConnectionStatus {
    if (WakuRelayerWakuCore.hasError) {
      return RelayerConnectionStatus.Error;
    }
    if (!WakuRelayerWakuCore.waku) {
      return RelayerConnectionStatus.Disconnected;
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
    if (!isDefined(relayerFees) || !isDefined(relayerFees.forToken)) {
      return false;
    }

    const cachedTokenRelayers = Object.values(relayerFees.forToken);

    return (
      cachedTokenRelayers.find(tokenRelayerMap => {
        const unfilteredRelayerAddresses = Object.keys(
          tokenRelayerMap.forRelayer,
        );
        const filteredRelayerAddresses = AddressFilter.filter(
          unfilteredRelayerAddresses,
        );
        return filteredRelayerAddresses.length > 0;
      }) != null
    );
  }

  private static getAggregatedInfoForRelayers(chain: Chain) {
    const relayerFees = RelayerFeeCache.feesForChain(chain);
    if (!isDefined(relayerFees) || !isDefined(relayerFees.forToken)) {
      return { allRelayerFeesExpired: false, anyRelayersAvailable: false };
    }

    const cachedTokenRelayers = Object.values(relayerFees.forToken);

    let allRelayerFeesExpired = true;
    let anyRelayersAvailable = false;

    cachedTokenRelayers.forEach(tokenRelayerMap => {
      const unfilteredRailgunAddresses = Object.keys(
        tokenRelayerMap.forRelayer,
      );
      const filteredRailgunAddresses = AddressFilter.filter(
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
