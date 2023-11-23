import { decryptAESGCM256 } from '@railgun-community/wallet';
import { IMessage } from '@waku/interfaces';
import { bytesToUtf8 } from '../utils/conversion.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import { isDefined } from '../utils/is-defined.js';

export type WakuTransactResponse = {
  id: string;
  txHash?: string;
  error?: string;
};

export class RelayerTransactResponse {
  static storedTransactionResponse: Optional<WakuTransactResponse>;
  static sharedKey: Optional<Uint8Array>;

  static setSharedKey = (key: Uint8Array) => {
    RelayerTransactResponse.sharedKey = key;
    RelayerTransactResponse.storedTransactionResponse = undefined;
  };

  static clearSharedKey = () => {
    RelayerTransactResponse.sharedKey = undefined;
    RelayerTransactResponse.storedTransactionResponse = undefined;
  };

  static async handleRelayerTransactionResponseMessage(message: IMessage) {
    if (!RelayerTransactResponse.sharedKey) {
      return;
    }
    if (!isDefined(message.payload)) {
      return;
    }
    try {
      const payload = bytesToUtf8(message.payload);

      const { result: encryptedData } = JSON.parse(payload) as {
        result: [string, string];
      };

      const decrypted = decryptAESGCM256(
        encryptedData,
        RelayerTransactResponse.sharedKey,
      );
      if (decrypted == null) {
        return;
      }

      RelayerDebug.log('Handle Relayer transact-response message:');
      RelayerDebug.log(JSON.stringify(decrypted));

      RelayerTransactResponse.storedTransactionResponse =
        decrypted as WakuTransactResponse;
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      RelayerDebug.error(
        new Error('Could not handle Relayer tx response message', { cause }),
      );
    }
  }
}
