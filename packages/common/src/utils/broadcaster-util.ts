import {
  CachedTokenFee,
  Chain,
  networkForChain,
  versionCompare,
} from '@railgun-community/shared-models';
import { getRailgunWalletAddressData } from '@railgun-community/wallet';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { isDefined } from './is-defined.js';

const FEE_EXPIRATION_MINIMUM_MSEC = 40000;

const PAYEE_KEY_CACHE_MAX_SIZE = 5000;

export const DEFAULT_BROADCASTER_IDENTIFIER = 'default';

const payeeKeyCache = new Map<string, string>();

/**
 * A 0zk address encodes { masterPublicKey, networkID, viewingPublicKey }, but
 * only the master public key decides who owns a fee note - the note public key
 * is poseidon(masterPublicKey, random). The viewing key merely decides who can
 * decrypt it, and the networkID is not part of the payee at all.
 *
 * Fee messages are self-signed against the viewing key of the address they
 * claim, so a single operator can mint unlimited valid, distinct addresses that
 * all pay the same wallet. Group broadcasters on the master public key so that
 * announcing more addresses (or more identifiers under one address) can never
 * win an operator extra slots in the list.
 */
export const payeeKeyForBroadcaster = (railgunAddress: string): string => {
  const cached = payeeKeyCache.get(railgunAddress);
  if (isDefined(cached)) {
    return cached;
  }

  let payeeKey: string;
  try {
    payeeKey = getRailgunWalletAddressData(
      railgunAddress,
    ).masterPublicKey.toString();
  } catch {
    payeeKey = railgunAddress;
  }

  if (payeeKeyCache.size >= PAYEE_KEY_CACHE_MAX_SIZE) {
    payeeKeyCache.clear();
  }
  payeeKeyCache.set(railgunAddress, payeeKey);

  return payeeKey;
};

export const shortenAddress = (address: string): string => {
  if (address.length < 13) {
    return address;
  }
  // 12 chars separated by '...'
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
};

export const nameForBroadcaster = (
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
  // If submitted after feeCacheID expires, it risks "Bad token fee" error from Broadcaster.
  return feeExpiration < Date.now() + FEE_EXPIRATION_MINIMUM_MSEC;
};

export const invalidBroadcasterVersion = (version: Optional<string>) => {
  return (
    versionCompare(
      version ?? '0.0.0',
      BroadcasterConfig.MINIMUM_BROADCASTER_VERSION,
    ) < 0 ||
    versionCompare(
      version ?? '0.0.0',
      BroadcasterConfig.MAXIMUM_BROADCASTER_VERSION,
    ) > 0
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

    const expectedRelayAdapt = network.relayAdaptHistory;
    // TODO: switch back when all testing and migration to new adapt has completed.
    if (relayAdapt && !expectedRelayAdapt.includes(relayAdapt)) {
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
