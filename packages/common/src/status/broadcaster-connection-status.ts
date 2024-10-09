import {
  Chain,
  BroadcasterConnectionStatus,
  isDefined,
  CachedTokenFee,
} from '@railgun-community/shared-models';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { AddressFilter } from '../filters/address-filter.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { cachedFeeExpired } from '../utils/broadcaster-util.js';
import { WakuLightNodeCore } from '../waku/waku-node/waku-light/waku-light-core.js';
import { WakuRelayNodeCore } from '../waku/waku-node/waku-relay/waku-relay-core.js';

export class BroadcasterStatus {
  static getBroadcasterConnectionStatus(
    chain: Chain,
  ): BroadcasterConnectionStatus {
    // First check if either node type failed to connect
    if (WakuLightNodeCore.connectFailed || WakuRelayNodeCore.connectFailed) {
      BroadcasterDebug.log(
        'Waku node failed to connect, pollStatus should catch and retry',
      );
      return BroadcasterConnectionStatus.Error;
    }

    // Check if we have any active waku instance
    const hasActiveNode = WakuLightNodeCore.waku || WakuRelayNodeCore.waku;
    if (!hasActiveNode) {
      BroadcasterDebug.log('No active Waku instance');
      return BroadcasterConnectionStatus.Disconnected;
    }

    // Check for broadcaster fees - this is the first status when client starts
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
