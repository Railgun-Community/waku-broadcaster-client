import {
  CachedTokenFee,
  Chain,
  networkForChain,
} from '@railgun-community/shared-models';
import { AddressFilter } from '../filters/address-filter.js';
import { RelayerConfig } from '../models/relayer-config.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import {
  nameForRelayer,
  cachedFeeExpired,
  DEFAULT_RELAYER_IDENTIFIER,
  invalidRelayerVersion,
  cachedFeeUnavailableOrExpired,
} from '../utils/relayer-util.js';

// {forNetwork: {forToken: {forRelayer: (fee, updatedAt)}}}
type RelayerFeeNetworkTokenRelayerCacheMap = {
  forIdentifier: MapType<CachedTokenFee>;
};
type RelayerFeeNetworkTokenCacheMap = {
  forRelayer: MapType<RelayerFeeNetworkTokenRelayerCacheMap>;
};
type RelayerFeeNetworkCacheMap = {
  forToken: MapType<RelayerFeeNetworkTokenCacheMap>;
};
export type RelayerFeeCacheState = {
  forNetwork: MapType<RelayerFeeNetworkCacheMap>;
};

export class RelayerFeeCache {
  private static cache: RelayerFeeCacheState = { forNetwork: {} };

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
        RelayerDebug.log(
          `[Fees] Relayer ${railgunAddress} requires POI list key ${listKey}, which is not active.`,
        );
        return;
      }
    }

    const relayerName = nameForRelayer(railgunAddress, identifier);
    const networkName = network.name;

    if (invalidRelayerVersion(version)) {
      RelayerDebug.log(
        `[Fees] Relayer version ${version} invalid (req ${RelayerConfig.MINIMUM_RELAYER_VERSION}-${RelayerConfig.MAXIMUM_RELAYER_VERSION}): ${relayerName}`,
      );
      return;
    }

    if (cachedFeeExpired(feeExpiration)) {
      RelayerDebug.log(
        `[Fees] Fees expired for ${networkName} (${relayerName})`,
      );
      return;
    }

    const tokenAddresses = Object.keys(tokenFeeMap);
    RelayerDebug.log(
      `[Fees] Updating fees for ${networkName} (${relayerName}): ${tokenAddresses.length} tokens`,
    );

    this.cache.forNetwork[networkName] ??= { forToken: {} };

    const tokenAddressesLowercase = tokenAddresses.map(address =>
      address.toLowerCase(),
    );
    tokenAddressesLowercase.forEach(tokenAddress => {
      this.cache.forNetwork[networkName].forToken[tokenAddress] ??= {
        forRelayer: {},
      };
      this.cache.forNetwork[networkName].forToken[tokenAddress].forRelayer[
        railgunAddress
      ] ??= { forIdentifier: {} };

      this.cache.forNetwork[networkName].forToken[tokenAddress].forRelayer[
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

  static feesForChain(chain: Chain): Optional<RelayerFeeNetworkCacheMap> {
    const network = networkForChain(chain);
    if (!network) {
      throw new Error('Chain not found.');
    }
    return this.cache.forNetwork[network.name];
  }

  static feesForToken(
    chain: Chain,
    tokenAddress: string,
  ): Optional<RelayerFeeNetworkTokenCacheMap> {
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

    const railgunAddresses = Object.keys(feesForToken.forRelayer);
    const filteredRailgunAddresses = AddressFilter.filter(railgunAddresses);

    const cachedFees: CachedTokenFee[] = filteredRailgunAddresses
      .map(railgunAddress =>
        Object.values(feesForToken.forRelayer[railgunAddress].forIdentifier),
      )
      .flat();

    const availableUnexpiredFee = cachedFees.find(
      cachedFee =>
        !cachedFeeUnavailableOrExpired(cachedFee, chain, useRelayAdapt),
    );
    return availableUnexpiredFee != null;
  }
}
