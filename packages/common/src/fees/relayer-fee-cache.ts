import {
  CachedTokenFee,
  Chain,
  networkForChain,
} from '@railgun-community/shared-models';
import { AddressFilter } from '../filters/address-filter.js';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import {
  nameForBroadcaster,
  cachedFeeExpired,
  DEFAULT_RELAYER_IDENTIFIER,
  invalidBroadcasterVersion,
  cachedFeeUnavailableOrExpired,
} from '../utils/broadcaster-util.js';

// {forNetwork: {forToken: {forBroadcaster: (fee, updatedAt)}}}
type BroadcasterFeeNetworkTokenBroadcasterCacheMap = {
  forIdentifier: MapType<CachedTokenFee>;
};
type BroadcasterFeeNetworkTokenCacheMap = {
  forBroadcaster: MapType<BroadcasterFeeNetworkTokenBroadcasterCacheMap>;
};
type BroadcasterFeeNetworkCacheMap = {
  forToken: MapType<BroadcasterFeeNetworkTokenCacheMap>;
};
export type BroadcasterFeeCacheState = {
  forNetwork: MapType<BroadcasterFeeNetworkCacheMap>;
};

export class BroadcasterFeeCache {
  private static cache: BroadcasterFeeCacheState = { forNetwork: {} };

  private static poiActiveListKeys: Optional<string[]>;

  static init(poiActiveListKeys: string[]) {
    this.poiActiveListKeys = poiActiveListKeys;
  }

  static addTokenFees(
    chain: Chain,
    railgunAddress: string,
    feeExpiration: number,
    tokenFeeMap: MapType<CachedTokenFee>,
    identifier: Optional<string>,
    version: string,
    requiredPOIListKeys: string[],
  ) {
    const network = networkForChain(chain);
    if (!network) {
      return;
    }

    if (!this.poiActiveListKeys) {
      throw new Error(
        'Must define active POI list keys before adding any fees.',
      );
    }
    for (const listKey of requiredPOIListKeys) {
      if (!this.poiActiveListKeys.includes(listKey)) {
        BroadcasterDebug.log(
          `[Fees] Broadcaster ${railgunAddress} requires POI list key ${listKey}, which is not active.`,
        );
        return;
      }
    }

    const relayerName = nameForBroadcaster(railgunAddress, identifier);
    const networkName = network.name;

    if (invalidBroadcasterVersion(version)) {
      BroadcasterDebug.log(
        `[Fees] Broadcaster version ${version} invalid (req ${BroadcasterConfig.MINIMUM_RELAYER_VERSION}-${BroadcasterConfig.MAXIMUM_RELAYER_VERSION}): ${relayerName}`,
      );
      return;
    }

    if (cachedFeeExpired(feeExpiration)) {
      BroadcasterDebug.log(
        `[Fees] Fees expired for ${networkName} (${relayerName})`,
      );
      return;
    }

    const tokenAddresses = Object.keys(tokenFeeMap);
    BroadcasterDebug.log(
      `[Fees] Updating fees for ${networkName} (${relayerName}): ${tokenAddresses.length} tokens`,
    );

    this.cache.forNetwork[networkName] ??= { forToken: {} };

    const tokenAddressesLowercase = tokenAddresses.map(address =>
      address.toLowerCase(),
    );
    tokenAddressesLowercase.forEach(tokenAddress => {
      this.cache.forNetwork[networkName].forToken[tokenAddress] ??= {
        forBroadcaster: {},
      };
      this.cache.forNetwork[networkName].forToken[tokenAddress].forBroadcaster[
        railgunAddress
      ] ??= { forIdentifier: {} };

      this.cache.forNetwork[networkName].forToken[tokenAddress].forBroadcaster[
        railgunAddress
      ].forIdentifier[identifier ?? DEFAULT_RELAYER_IDENTIFIER] =
        tokenFeeMap[tokenAddress];
    });
  }

  static resetCache(chain: Chain) {
    const network = networkForChain(chain);
    if (!network) {
      return;
    }
    this.cache.forNetwork ??= {};
    delete this.cache.forNetwork[network.name];
  }

  static feesForChain(chain: Chain): Optional<BroadcasterFeeNetworkCacheMap> {
    const network = networkForChain(chain);
    if (!network) {
      throw new Error('Chain not found.');
    }
    return this.cache.forNetwork[network.name];
  }

  static feesForToken(
    chain: Chain,
    tokenAddress: string,
  ): Optional<BroadcasterFeeNetworkTokenCacheMap> {
    return this.feesForChain(chain)?.forToken[tokenAddress.toLowerCase()];
  }

  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): boolean {
    const feesForToken = this.feesForToken(chain, tokenAddress);
    if (!feesForToken) {
      return false;
    }

    const railgunAddresses = Object.keys(feesForToken.forBroadcaster);
    const filteredRailgunAddresses = AddressFilter.filter(railgunAddresses);

    const cachedFees: CachedTokenFee[] = filteredRailgunAddresses
      .map(railgunAddress =>
        Object.values(
          feesForToken.forBroadcaster[railgunAddress].forIdentifier,
        ),
      )
      .flat();

    const availableUnexpiredFee = cachedFees.find(
      cachedFee =>
        !cachedFeeUnavailableOrExpired(cachedFee, chain, useRelayAdapt),
    );
    return availableUnexpiredFee != null;
  }
}
