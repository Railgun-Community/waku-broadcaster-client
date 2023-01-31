import {
  verifyRelayerSignature,
  getRailgunWalletAddressData,
} from '@railgun-community/quickstart';
import {
  CachedTokenFee,
  Chain,
  RelayerFeeMessageData,
} from '@railgun-community/shared-models';
import crypto from 'crypto';
import { IMessage } from '@waku/interfaces';
import { contentTopics } from '../waku/waku-topics';
import { RelayerDebug } from '../utils/relayer-debug';
import { RelayerConfig } from '../models/relayer-config';
import { RelayerFeeCache } from './relayer-fee-cache';
import { invalidRelayerVersion } from '../utils/relayer-util';
import { bytesToUtf8, hexToUTF8String } from '../utils/conversion';

const isExpiredTimestamp = (timestamp: Optional<Date>) => {
  if (!timestamp) {
    return false;
  }
  if (timestamp.getFullYear() === 1970) {
    // Waku timestamp bug.
    return false;
  }

  // Expired if message originated > 45 seconds ago.
  const expirationMsec = Date.now() - 45 * 1000;
  return timestamp.getTime() < expirationMsec;
};

export const handleRelayerFeesMessage = async (
  chain: Chain,
  message: IMessage,
  contentTopic: string,
) => {
  try {
    if (!message.payload) {
      return;
    }
    if (contentTopic !== contentTopics.fees(chain)) {
      return;
    }
    if (isExpiredTimestamp(message.timestamp)) {
      return;
    }

    const payload = bytesToUtf8(message.payload);
    const { data, signature } = JSON.parse(payload) as {
      data: string;
      signature: string;
    };
    const utf8String = hexToUTF8String(data);
    const feeMessageData = JSON.parse(utf8String) as RelayerFeeMessageData;

    if (!crypto.subtle && RelayerConfig.IS_DEV) {
      RelayerDebug.log(
        'Skipping Relayer fee validation in DEV. `crypto.subtle` does not exist (not secure: use https or localhost). ',
      );
      updateFeesForRelayer(chain, feeMessageData);
      return;
    }

    if (invalidRelayerVersion(feeMessageData.version)) {
      RelayerDebug.log(
        `Skipping Relayer outside version range: ${feeMessageData.version}, ${feeMessageData.railgunAddress}`,
      );
      return;
    }

    const valid = await verifySignature(data, signature, feeMessageData);
    if (!valid) {
      return;
    }

    updateFeesForRelayer(chain, feeMessageData);
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    RelayerDebug.log('Error handling Relayer fees');
    const ignoreInTests = true;
    RelayerDebug.error(err, ignoreInTests);
  }
};

const verifySignature = async (
  data: string,
  signature: string,
  feeMessageData: RelayerFeeMessageData,
): Promise<boolean> => {
  const { railgunAddress } = feeMessageData;
  const { viewingPublicKey } = getRailgunWalletAddressData(railgunAddress);
  const valid = await verifyRelayerSignature(
    // TODO: Fix these types (String or Uin8Array in Quickstart / Engine)
    signature as any,
    data as any,
    viewingPublicKey,
  );
  return valid;
};

const updateFeesForRelayer = (
  chain: Chain,
  feeMessageData: RelayerFeeMessageData,
) => {
  const tokenFeeMap: MapType<CachedTokenFee> = {};
  const tokenAddresses = Object.keys(feeMessageData.fees);
  tokenAddresses.forEach(tokenAddress => {
    const feePerUnitGas = feeMessageData.fees[tokenAddress];
    if (feePerUnitGas) {
      const cachedFee: CachedTokenFee = {
        feePerUnitGas,
        expiration: feeMessageData.feeExpiration,
        feesID: feeMessageData.feesID,
        availableWallets: feeMessageData.availableWallets,
        relayAdapt: feeMessageData.relayAdapt,
      };
      tokenFeeMap[tokenAddress] = cachedFee;
    }
  });

  RelayerFeeCache.addTokenFees(
    chain,
    feeMessageData.railgunAddress,
    feeMessageData.feeExpiration,
    tokenFeeMap,
    feeMessageData.identifier,
    feeMessageData.version,
  );
};
