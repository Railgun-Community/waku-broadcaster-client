import {
  Chain,
  BroadcasterConnectionStatus,
  CachedTokenFee,
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
    if (WakuBroadcasterWakuCore.connectFailed) {
      // NOTE: First check if connect() error ocurred, poller should pick up and try again.
      BroadcasterDebug.log(
        'WakuBroadcasterWakuCore failed to connect, pollStatus should catch and retry',
      );
      return BroadcasterConnectionStatus.Error;
    }

    if (!WakuBroadcasterWakuCore.waku) {
      BroadcasterDebug.log(
        'WakuBroadcasterWakuCore does not have waku instance',
      );
      return BroadcasterConnectionStatus.Disconnected;
    }

    // NOTE: This is the first status that shows when client starts (before fees are retrieved)
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
    // Get broadcaster fees for the chain
    const broadcasterFees = BroadcasterFeeCache.feesForChain(chain);

    // If no fees are found or no fees for token are found, return false
    if (!isDefined(broadcasterFees) || !isDefined(broadcasterFees.forToken)) {
      BroadcasterDebug.log(
        !isDefined(broadcasterFees)
          ? 'No broadcaster fees found'
          : 'No broadcaster fees for token found',
      );
      return {
        allBroadcasterFeesExpired: false,
        anyBroadcastersAvailable: false,
      };
    }

    // Get all token fees
    const cachedTokenBroadcasters = Object.values(broadcasterFees.forToken);

    let allBroadcasterFeesExpired = true;
    let anyBroadcastersAvailable = false;

    outerLoop: for (const tokenBroadcasterMap of cachedTokenBroadcasters) {
      // Filter out broadcaster addresses
      const filteredRailgunAddresses = AddressFilter.filter(
        Object.keys(tokenBroadcasterMap.forBroadcaster),
      );

      // For each railgunAddress, check if any broadcaster is available
      for (const railgunAddress of filteredRailgunAddresses) {
        // Get all identifiers for the railgunAddress
        const identifiers = Object.keys(
          tokenBroadcasterMap.forBroadcaster[railgunAddress].forIdentifier,
        );

        for (const identifier of identifiers) {
          const tokenFee: CachedTokenFee =
            tokenBroadcasterMap.forBroadcaster[railgunAddress].forIdentifier[
              identifier
            ];
          if (!cachedFeeExpired(tokenFee.expiration)) {
            allBroadcasterFeesExpired = false;
            if (tokenFee.availableWallets > 0) {
              anyBroadcastersAvailable = true;
              break outerLoop; // break outermost loop if any broadcaster is available
            }
          }
        }
      }
    }

    return { allBroadcasterFeesExpired, anyBroadcastersAvailable };
  }
}
