import {
  getRailgunWalletAddressData,
  encryptDataWithSharedKey,
  getCompletedTxidFromNullifiers,
} from '@railgun-community/quickstart';
import {
  Chain,
  EncryptDataWithSharedKeyResponse,
  poll,
  RelayerMethodParamsTransact,
  RelayerRawParamsTransact,
} from '@railgun-community/shared-models';
import { bytesToHex } from '@waku/byte-utils';
import { RelayerConfig } from '../models/relayer-config';
import { RelayerDebug } from '../utils/relayer-debug';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core';
import { contentTopics } from '../waku/waku-topics';
import {
  WakuTransactResponse,
  RelayerTransactResponse,
} from './relayer-transact-response';

//
// Transact: Encryption Flow
//
// Client:
// 1. Generates random 16 bytes: `responseKey` and adds to transact data
// 2. Generates a `sharedKey` from a random `privkey` and the Relayer's `pubkey`
// 3. Encrypts the transact data asymmetrically, using `sharedKey` (`encryptedData = encrypt(transactData, sharedKey)`)
// 4. Includes `publicKey` and `encryptedData` in transact message
// 5. Sends the message
//
// Relayer:
// 1. Decrypts the `encryptedData` using Relayer privkey and `sharedKey` (if error, it's not addressed to us)
// 2. Processes transaction
// 3. Encrypts response (`txHash` or `error`) using `responseKey` (symmetric: AES-GCM-256)
// 4. Sends back encrypted response on transact-response: {encryptedData}
//
// Client:
// 1. Catches all `transact-response`'s after sending a transaction.
// 2. Decrypts each using the `responseKey`. (If error, not addressed to us)
// 3. After successful decryption, parses `txHash` or `error`.
//

enum RelayRetryState {
  RetryTransact = 'RetryTransact',
  Wait = 'Wait',
  Timeout = 'Timeout',
}

type RelayMessageData = {
  method: string;
  params: RelayerMethodParamsTransact;
};

// NOTE: Relayer default transaction-send timeout is 45 seconds.
const SECONDS_PER_RETRY = 1.5;
const POLL_DELAY_SECONDS = 0.1;
const RETRY_TRANSACTION_SECONDS = 15;
const POST_ALERT_TOTAL_WAITING_SECONDS = 60;

export class RelayerTransaction {
  private messageData: RelayMessageData;
  private contentTopic: string;
  private chain: Chain;
  private nullifiers: string[];

  constructor(
    encryptedDataResponse: EncryptDataWithSharedKeyResponse,
    chain: Chain,
    nullifiers: string[],
  ) {
    this.messageData = {
      method: 'transact',
      params: {
        pubkey: encryptedDataResponse.randomPubKey,
        encryptedData: encryptedDataResponse.encryptedData,
      },
    };
    this.contentTopic = contentTopics.transact(chain);
    this.chain = chain;
    this.nullifiers = nullifiers;
    RelayerTransactResponse.setTransactionResponseSharedKey(
      encryptedDataResponse.sharedKey,
    );
  }

  static async create(
    serializedTransaction: string,
    relayerRailgunAddress: string,
    relayerFeesID: string,
    chain: Chain,
    nullifiers: string[],
    overallBatchMinGasPrice: Optional<string>,
    useRelayAdapt: boolean,
  ): Promise<RelayerTransaction> {
    const encryptedDataResponse = await this.encryptTransaction(
      serializedTransaction,
      relayerRailgunAddress,
      relayerFeesID,
      chain,
      overallBatchMinGasPrice,
      useRelayAdapt,
    );
    return new RelayerTransaction(encryptedDataResponse, chain, nullifiers);
  }

  private static async encryptTransaction(
    serializedTransaction: string,
    relayerRailgunAddress: string,
    relayerFeesID: string,
    chain: Chain,
    overallBatchMinGasPrice: Optional<string>,
    useRelayAdapt: boolean,
  ): Promise<EncryptDataWithSharedKeyResponse> {
    if (!overallBatchMinGasPrice) {
      throw new Error('Requires batch minGasPrice for Relayers.');
    }

    const { viewingPublicKey: relayerViewingKey } = getRailgunWalletAddressData(
      relayerRailgunAddress,
    );

    const transactData: RelayerRawParamsTransact = {
      serializedTransaction,
      relayerViewingKey: bytesToHex(relayerViewingKey),
      chainID: chain.id,
      chainType: chain.type,
      minGasPrice: overallBatchMinGasPrice,
      feesID: relayerFeesID,
      useRelayAdapt,
      devLog: RelayerConfig.IS_DEV,
      minVersion: RelayerConfig.MINIMUM_RELAYER_VERSION,
      maxVersion: RelayerConfig.MAXIMUM_RELAYER_VERSION,
    };

    const encryptedDataResponse = await encryptDataWithSharedKey(
      transactData,
      relayerViewingKey,
    );

    return encryptedDataResponse;
  }

  private async findMatchingNullifierTxid(): Promise<Optional<string>> {
    const { txid, error } = await getCompletedTxidFromNullifiers(
      this.chain,
      this.nullifiers,
    );
    if (error) {
      RelayerDebug.error(new Error(error));
    }
    return txid;
  }

  private async getTransactionResponse(): Promise<
    Optional<WakuTransactResponse>
  > {
    if (RelayerTransactResponse.storedTransactionResponse) {
      return RelayerTransactResponse.storedTransactionResponse;
    }

    const nullifiersTxid = await this.findMatchingNullifierTxid();
    if (nullifiersTxid) {
      return {
        id: 'nullifier-transaction',
        txHash: nullifiersTxid,
      };
    }

    return undefined;
  }

  getRelayRetryState(retryNumber: number): RelayRetryState {
    const retrySeconds = retryNumber * SECONDS_PER_RETRY;
    if (retrySeconds <= RETRY_TRANSACTION_SECONDS) {
      return RelayRetryState.RetryTransact;
    }
    if (retrySeconds >= POST_ALERT_TOTAL_WAITING_SECONDS) {
      return RelayRetryState.Timeout;
    }
    return RelayRetryState.Wait;
  }

  async relay(retryNumber = 0): Promise<string> {
    const relayRetryState = this.getRelayRetryState(retryNumber);
    switch (relayRetryState) {
      case RelayRetryState.RetryTransact:
        // 0-20 seconds.
        RelayerDebug.log(
          `Relay Waku message: ${this.messageData.method} via ${this.contentTopic}`,
        );
        await WakuRelayerWakuCore.relayMessage(
          this.messageData,
          this.contentTopic,
        );
        break;
      case RelayRetryState.Wait:
        // 21-60 seconds.
        // Do nothing.
        break;
      case RelayRetryState.Timeout:
        // Exactly 60 seconds.
        throw new Error('Request timed out.');
    }

    // 15 iterations (1.5 sec total, iterate every 100ms).
    const pollIterations = SECONDS_PER_RETRY / POLL_DELAY_SECONDS;

    const response: Optional<WakuTransactResponse> = await poll(
      async () => this.getTransactionResponse(),
      (result: Optional<WakuTransactResponse>) => result != null,
      POLL_DELAY_SECONDS * 1000,
      pollIterations,
    );
    if (response) {
      if (response.txHash) {
        RelayerTransactResponse.clearTransactionResponseSharedKey();
        return response.txHash;
      }
      if (response.error) {
        RelayerTransactResponse.clearTransactionResponseSharedKey();
        throw new Error(response.error);
      }
    }

    // Retry.
    return this.relay(retryNumber + 1);
  }
}
