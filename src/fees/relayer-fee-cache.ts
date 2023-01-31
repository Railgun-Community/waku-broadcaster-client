import {
  CachedTokenFee,
  Chain,
  networkForChain,
} from '@railgun-community/shared-models';
import { RelayerConfig } from '../models/relayer-config';
import { RelayerDebug } from '../utils/relayer-debug';
import {
  nameForRelayer,
  cachedFeeExpired,
  DEFAULT_RELAYER_IDENTIFIER,
  invalidRelayerVersion,
} from '../utils/relayer-util';

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

  static addTokenFees(
    chain: Chain,
    railgunAddress: string,
    feeExpiration: number,
    tokenFeeMap: MapType<CachedTokenFee>,
    identifier: Optional<string>,
    version: string,
  ) {
    const network = networkForChain(chain);
    if (!network) {
      return;
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

  static feesForChain(chain: Chain): RelayerFeeNetworkCacheMap {
    const network = networkForChain(chain);
    if (!network) {
      throw new Error('Chain not found.');
    }
    return this.cache.forNetwork[network.name];
  }
}
