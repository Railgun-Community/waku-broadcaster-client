import { decryptAESGCM256 } from '@railgun-community/quickstart';
import { bytesToUtf8 } from '@waku/byte-utils';
import { IMessage } from '@waku/interfaces';
import { RelayerDebug } from '../utils/relayer-debug';

export type WakuTransactResponse = {
  id: string;
  txHash?: string;
  error?: string;
};

export class RelayerTransactResponse {
  static storedTransactionResponse: Optional<WakuTransactResponse>;
  private static transactionResponseSharedKey: Optional<Uint8Array>;

  static setTransactionResponseSharedKey = (key: Uint8Array) => {
    RelayerTransactResponse.transactionResponseSharedKey = key;
    RelayerTransactResponse.storedTransactionResponse = undefined;
  };

  static clearTransactionResponseSharedKey = () => {
    RelayerTransactResponse.transactionResponseSharedKey = undefined;
    RelayerTransactResponse.storedTransactionResponse = undefined;
  };

  static async handleRelayerTransactionResponseMessage(message: IMessage) {
    if (!RelayerTransactResponse.transactionResponseSharedKey) {
      return;
    }
    if (!message.payload) {
      return;
    }
    try {
      const payload = bytesToUtf8(message.payload);

      const { result: encryptedData } = JSON.parse(payload) as {
        result: [string, string];
      };

      const decrypted = await decryptAESGCM256(
        encryptedData,
        RelayerTransactResponse.transactionResponseSharedKey,
      );
      if (decrypted == null) {
        return;
      }

      RelayerDebug.log('Handle Relayer transact-response message:');
      RelayerDebug.log(JSON.stringify(decrypted));

      RelayerTransactResponse.storedTransactionResponse =
        decrypted as WakuTransactResponse;
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.log(`Could not handle Relayer tx response message`);
      RelayerDebug.error(err);
    }
  }
}
