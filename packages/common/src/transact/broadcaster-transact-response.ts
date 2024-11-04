import { decryptAESGCM256 } from '@railgun-community/wallet';
import { bytesToUtf8 } from '../utils/conversion.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { IMessage } from '@waku/sdk';

export type WakuTransactResponse = {
  id: string;
  txHash?: string;
  error?: string;
};

export class BroadcasterTransactResponse {
  static storedTransactionResponse: Optional<WakuTransactResponse>;
  static sharedKey: Optional<Uint8Array>;

  static setSharedKey = (key: Uint8Array) => {
    BroadcasterTransactResponse.sharedKey = key;
    BroadcasterTransactResponse.storedTransactionResponse = undefined;
  };

  static clearSharedKey = () => {
    BroadcasterTransactResponse.sharedKey = undefined;
    BroadcasterTransactResponse.storedTransactionResponse = undefined;
  };

  static async handleBroadcasterTransactionResponseMessage(message: IMessage) {
    BroadcasterDebug.log('Transact Response received.');
    if (!BroadcasterTransactResponse.sharedKey) {
      BroadcasterDebug.log('No shared key set for transact response.');
      return;
    }
    if (!isDefined(message.payload)) {
      BroadcasterDebug.log('No payload in transact response message.');
      return;
    }
    try {
      const payload = bytesToUtf8(message.payload);

      const { result: encryptedData } = JSON.parse(payload) as {
        result: [string, string];
      };

      const decrypted = decryptAESGCM256(
        encryptedData,
        BroadcasterTransactResponse.sharedKey,
      );
      if (decrypted == null) {
        BroadcasterDebug.log('Could not decrypt transact response message.');
        return;
      }

      BroadcasterDebug.log('Handle Broadcaster transact-response message:');
      BroadcasterDebug.log(JSON.stringify(decrypted));

      BroadcasterTransactResponse.storedTransactionResponse =
        decrypted as WakuTransactResponse;
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      BroadcasterDebug.error(
        new Error('Could not handle Broadcaster tx response message', {
          cause,
        }),
      );
    }
  }
}
