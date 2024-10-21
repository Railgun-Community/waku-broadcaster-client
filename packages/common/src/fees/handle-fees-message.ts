import {
  verifyBroadcasterSignature,
  getRailgunWalletAddressData,
} from '@railgun-community/wallet';
import {
  CachedTokenFee,
  Chain,
  BroadcasterFeeMessageData,
} from '@railgun-community/shared-models';
import crypto from 'crypto';
import { IMessage } from '@waku/interfaces';
import { contentTopics } from '../waku/waku-topics.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { BroadcasterFeeCache } from './broadcaster-fee-cache.js';
import { invalidBroadcasterVersion } from '../utils/broadcaster-util.js';
import { bytesToUtf8, hexToUTF8String } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';

const isExpiredTimestamp = (
  timestamp: Optional<Date>,
  expirationFeeTimestamp: Optional<Date>,
) => {
  if (!timestamp || !expirationFeeTimestamp) {
    return false;
  }
  let messageTimestamp = timestamp;
  if (messageTimestamp.getFullYear() === 1970) {
    // Waku timestamp bug.
    messageTimestamp = new Date(messageTimestamp.getTime() * 1000);
  }
  // Expired if message originated > 45 seconds ago.
  // check if fee expires within 45 seconds; if it doesn't ignore it.
  const nowTime = Date.now();
  const expirationMsec = nowTime - 45 * 1000;
  // const expirationFeeMsec = nowTime + 45 * 1000;
  const timestampExpired = messageTimestamp.getTime() < expirationMsec;
  if (timestampExpired) {
    BroadcasterDebug.log(
      `Broadcaster Fee STALE: Difference was ${
        (Date.now() - messageTimestamp.getTime()) / 1000
      }s`,
    );
  } else {
    BroadcasterDebug.log(
      `Broadcaster Fee receipt SUCCESS in ${
        (Date.now() - messageTimestamp.getTime()) / 1000
      }s`,
    );
  }
  // const feeExpired = expirationFeeTimestamp.getTime() < expirationFeeMsec;
  return timestampExpired; //  || feeExpired;
};

export const handleBroadcasterFeesMessage = async (
  chain: Chain,
  message: IMessage,
  contentTopic: string,
) => {
  try {
    if (!isDefined(message.payload)) {
      BroadcasterDebug.log('Skipping Broadcaster fees message: NO PAYLOAD');
      return;
    }
    if (contentTopic !== contentTopics.fees(chain)) {
      BroadcasterDebug.log('Skipping Broadcaster fees message: WRONG TOPIC');
      return;
    }
    const payload = bytesToUtf8(message.payload);
    const { data, signature } = JSON.parse(payload) as {
      data: string;
      signature: string;
    };
    const utf8String = hexToUTF8String(data);
    const feeMessageData = JSON.parse(utf8String) as BroadcasterFeeMessageData;
    const feeExpirationTime = new Date(feeMessageData.feeExpiration);
    if (isExpiredTimestamp(message.timestamp, feeExpirationTime)) {
      BroadcasterDebug.log('Skipping fee message. Timestamp Expired.');
      return;
    }

    if (!isDefined(crypto.subtle) && BroadcasterConfig.IS_DEV) {
      BroadcasterDebug.log(
        'Skipping Broadcaster fee validation in DEV. `crypto.subtle` does not exist (not secure: use https or localhost). ',
      );
      updateFeesForBroadcaster(chain, feeMessageData);
      return;
    }

    if (invalidBroadcasterVersion(feeMessageData.version)) {
      BroadcasterDebug.log(
        `Skipping Broadcaster outside version range: ${feeMessageData.version}, ${feeMessageData.railgunAddress}`,
      );
      return;
    }

    const { railgunAddress } = feeMessageData;
    const { viewingPublicKey } = getRailgunWalletAddressData(railgunAddress);
    const verified = await verifyBroadcasterSignature(
      signature,
      data,
      viewingPublicKey,
    );
    if (!verified) {
      return;
    }

    updateFeesForBroadcaster(chain, feeMessageData);
  } catch (cause) {
    if (!(cause instanceof Error)) {
      throw new Error('Unexpected non-error thrown', { cause });
    }

    BroadcasterDebug.error(
      new Error('Error handling Broadcaster fees', { cause }),
    );
  }
};

const updateFeesForBroadcaster = (
  chain: Chain,
  feeMessageData: BroadcasterFeeMessageData,
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
        reliability: feeMessageData.reliability,
      };
      tokenFeeMap[tokenAddress] = cachedFee;
    }
  });

  BroadcasterFeeCache.addTokenFees(
    chain,
    feeMessageData.railgunAddress,
    feeMessageData.feeExpiration,
    tokenFeeMap,
    feeMessageData.identifier,
    feeMessageData.version,
    feeMessageData.requiredPOIListKeys ?? [],
  );
};
