import {
  CachedTokenFee,
  Chain,
  BroadcasterConnectionStatus,
} from '@railgun-community/shared-models';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { cachedFeeExpired } from '../utils/broadcaster-util.js';
import { WakuBroadcasterWakuCore } from '../waku/waku-broadcaster-waku-core.js';
import { isDefined } from '../utils/is-defined.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';

export class BroadcasterStatus {
  static getBroadcasterConnectionStatus(
    chain: Chain,
  ): BroadcasterConnectionStatus {
    BroadcasterDebug.log('Checking broadcaster connection status...');

    if (WakuBroadcasterWakuCore.hasError) {
      BroadcasterDebug.log('Waku has error');
      return BroadcasterConnectionStatus.Error;
    }
    if (!WakuBroadcasterWakuCore.waku) {
      BroadcasterDebug.log('Waku not initialized');
      return BroadcasterConnectionStatus.Disconnected;
    }
    if (!this.hasBroadcasterFeesForNetwork(chain)) {
      BroadcasterDebug.log('No broadcaster fees for network');
      return BroadcasterConnectionStatus.Searching;
    }

    const { allBroadcasterFeesExpired, anyBroadcastersAvailable } =
      this.getAggregatedInfoForBroadcasters(chain);
    if (allBroadcasterFeesExpired) {
      BroadcasterDebug.log('All broadcaster fees expired');
      return BroadcasterConnectionStatus.Disconnected;
    }
    if (!anyBroadcastersAvailable) {
      BroadcasterDebug.log('No broadcasters available');
      return BroadcasterConnectionStatus.AllUnavailable;
    }

    BroadcasterDebug.log('Connected to broadcasters');
    return BroadcasterConnectionStatus.Connected;
  }

  private static hasBroadcasterFeesForNetwork(chain: Chain) {
    const broadcasterFees = BroadcasterFeeCache.feesForChain(chain);
    if (!isDefined(broadcasterFees) || !isDefined(broadcasterFees.forToken)) {
      return false;
    }

    const cachedTokenBroadcasters = Object.values(broadcasterFees.forToken);

    return (
      cachedTokenBroadcasters.find(tokenBroadcasterMap => {
        const unfilteredBroadcasterAddresses = Object.keys(
          tokenBroadcasterMap.forBroadcaster,
        );
        const filteredBroadcasterAddresses = AddressFilter.filter(
          unfilteredBroadcasterAddresses,
        );
        return filteredBroadcasterAddresses.length > 0;
      }) != null
    );
  }

  private static getAggregatedInfoForBroadcasters(chain: Chain) {
    const broadcasterFees = BroadcasterFeeCache.feesForChain(chain);
    if (!isDefined(broadcasterFees) || !isDefined(broadcasterFees.forToken)) {
      return {
        allBroadcasterFeesExpired: false,
        anyBroadcastersAvailable: false,
      };
    }

    const cachedTokenBroadcasters = Object.values(broadcasterFees.forToken);

    let allBroadcasterFeesExpired = true;
    let anyBroadcastersAvailable = false;

    cachedTokenBroadcasters.forEach(tokenBroadcasterMap => {
      const unfilteredRailgunAddresses = Object.keys(
        tokenBroadcasterMap.forBroadcaster,
      );
      const filteredRailgunAddresses = AddressFilter.filter(
        unfilteredRailgunAddresses,
      );
      filteredRailgunAddresses.forEach(railgunAddress => {
        const identifiers: string[] = Object.keys(
          tokenBroadcasterMap.forBroadcaster[railgunAddress].forIdentifier,
        );

        // Loops until we hit `return false`.
        identifiers.every(identifier => {
          const tokenFee: CachedTokenFee =
            tokenBroadcasterMap.forBroadcaster[railgunAddress].forIdentifier[
              identifier
            ];
          if (cachedFeeExpired(tokenFee.expiration)) {
            return true; // continue
          }

          // Any unexpired means we didn't time out.
          allBroadcasterFeesExpired = false;

          if (tokenFee.availableWallets > 0) {
            anyBroadcastersAvailable = true;
            return false; // break
          }
          return true; //continue
        });
      });
    });

    return { allBroadcasterFeesExpired, anyBroadcastersAvailable };
  }
}
