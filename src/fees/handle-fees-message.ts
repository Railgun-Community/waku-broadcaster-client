import {
  verifyRelayerSignature,
  getRailgunWalletAddressData,
} from '@railgun-community/quickstart';
import { Chain, RelayerFeeMessageData } from '@railgun-community/shared-models';
import { IMessage } from '@waku/interfaces';
import { bytesToUtf8 } from '@waku/byte-utils';
import { contentTopics } from '../waku/waku-topics';
import { RelayerDebug } from '../utils/relayer-debug';
import { RelayerConfig } from '../models/relayer-config';
import { CachedTokenFee } from '../models/export-models';
import { RelayerFeeCache } from './relayer-fee-cache';
import { invalidRelayerVersion } from '../utils/relayer-util';

const subtleCrypto = crypto.subtle;

const hexToUTF8String = (hexData: string) => {
  const buffer = Buffer.from(hexData, 'hex');
  return new TextDecoder().decode(buffer);
};

const isExpiredTimestamp = (timestamp: Optional<Date>) => {
  if (!timestamp) {
    return false;
  }
  // 45 seconds ago.
  const expiration = Date.now() / 1000 - 45;
  return timestamp.getTime() < expiration;
};

export const handleRelayerFeesMessage = async (
  chain: Chain,
  message: IMessage,
  contentTopic: string,
) => {
  try {
    if (!message.payload) return;
    if (contentTopic !== contentTopics.fees(chain)) return;
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
    if (!subtleCrypto && RelayerConfig.IS_DEV) {
      RelayerDebug.log(
        'Skipping Relayer fee validation in DEV. `crypto.web.subtle` does not exist (not secure: use https or localhost). ',
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
    const railgunAddress = feeMessageData.railgunAddress;
    const { viewingPublicKey } = getRailgunWalletAddressData(railgunAddress);
    const valid = await verifyRelayerSignature(
      signature as any, // TODO: Fix these types (String or Uin8Array in Quickstart / Engine)
      data as any,
      viewingPublicKey,
    );
    if (valid) {
      updateFeesForRelayer(chain, feeMessageData);
    }
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }

    RelayerDebug.log('Error handling Relayer fees');
    RelayerDebug.error(err);
  }
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
