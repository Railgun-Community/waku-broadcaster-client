import {
  BroadcasterFeeMessageData,
  CachedTokenFee,
} from '@railgun-community/shared-models';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { BroadcasterFeeCache } from './broadcaster-fee-cache.js';
import { cachedFeeExpired } from '../utils/broadcaster-util.js';

export const handleAuthorizedFees = (
  feeMessageData: BroadcasterFeeMessageData,
) => {
  try {
    if (cachedFeeExpired(feeMessageData.feeExpiration)) {
      return;
    }

    const tokenFeeMap: MapType<CachedTokenFee> = {};
    const tokenAddresses = Object.keys(feeMessageData.fees);
    tokenAddresses.forEach(tokenAddress => {
      const feePerUnitGas = feeMessageData.fees[tokenAddress];
      if (feePerUnitGas) {
        const existingFee = BroadcasterFeeCache.getAuthorizedFee(tokenAddress.toLowerCase());
        if (
          existingFee &&
          existingFee.expiration >= feeMessageData.feeExpiration
        ) {
          return;
        }

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

    if (Object.keys(tokenFeeMap).length > 0) {
      BroadcasterFeeCache.addAuthorizedFees(tokenFeeMap);
      BroadcasterDebug.log('Updated Authorized Fees');
    }
  } catch (err) {
    BroadcasterDebug.error(err as Error);
  }
};
