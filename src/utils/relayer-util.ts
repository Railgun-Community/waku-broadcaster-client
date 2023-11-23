import {
  CachedTokenFee,
  Chain,
  networkForChain,
  versionCompare,
} from '@railgun-community/shared-models';
import { RelayerConfig } from '../models/relayer-config.js';
import { isDefined } from './is-defined.js';

const FEE_EXPIRATION_MINIMUM_MSEC = 40000;

export const DEFAULT_RELAYER_IDENTIFIER = 'default';

export const shortenAddress = (address: string): string => {
  if (address.length < 13) {
    return address;
  }
  // 12 chars separated by '...'
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
};

export const nameForRelayer = (
  railgunAddress: string,
  identifier: Optional<string>,
) => {
  const shortAddress = shortenAddress(railgunAddress);
  if (isDefined(identifier)) {
    return `${shortAddress}: ${identifier}`;
  }
  return shortAddress;
};

export const cachedFeeExpired = (feeExpiration: number) => {
  // Minimum of 40sec until expiration, in order to run the proof and submit.
  // If submitted after feeCacheID expires, it risks "Bad token fee" error from Relayer.
  return feeExpiration < Date.now() + FEE_EXPIRATION_MINIMUM_MSEC;
};

export const invalidRelayerVersion = (version: Optional<string>) => {
  return (
    versionCompare(version ?? '0.0.0', RelayerConfig.MINIMUM_RELAYER_VERSION) <
      0 ||
    versionCompare(version ?? '0.0.0', RelayerConfig.MAXIMUM_RELAYER_VERSION) >
      0
  );
};

export const cachedFeeUnavailableOrExpired = (
  cachedFee: CachedTokenFee,
  chain: Chain,
  useRelayAdapt: boolean,
) => {
  if (useRelayAdapt) {
    const relayAdapt = cachedFee.relayAdapt;
    if (!relayAdapt) {
      return true;
    }
    const network = networkForChain(chain);
    if (!network) {
      throw new Error(`Unrecognized chain ${chain}`);
    }
    const expectedRelayAdapt = network.relayAdaptContract;
    if (relayAdapt && relayAdapt !== expectedRelayAdapt) {
      return true;
    }
  }

  if (cachedFee.availableWallets === 0) {
    // No available wallets.
    return true;
  }

  if (cachedFeeExpired(cachedFee.expiration)) {
    return true;
  }

  return false;
};
