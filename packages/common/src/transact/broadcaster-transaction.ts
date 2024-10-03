import {
  getRailgunWalletAddressData,
  encryptDataWithSharedKey,
  getCompletedTxidFromNullifiers,
} from '@railgun-community/wallet';
import {
  Chain,
  EncryptDataWithSharedKeyResponse,
  poll,
  PreTransactionPOIsPerTxidLeafPerList,
  BroadcasterEncryptedMethodParams,
  BroadcasterRawParamsTransact,
  TXIDVersion,
} from '@railgun-community/shared-models';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { bytesToHex } from '../utils/conversion.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WakuBroadcasterWakuCore } from '../waku/waku-broadcaster-waku-core.js';
import { contentTopics } from '../waku/waku-topics.js';
import {
  WakuTransactResponse,
  BroadcasterTransactResponse,
} from './broadcaster-transact-response.js';
import { getAddress, isHexString } from 'ethers';

//
// Transact: Encryption Flow
//
// Client:
// 1. Generates random 16 bytes: `responseKey` and adds to transact data
// 2. Generates a `sharedKey` from a random `privkey` and the Broadcaster's `pubkey`
// 3. Encrypts the transact data asymmetrically, using `sharedKey` (`encryptedData = encrypt(transactData, sharedKey)`)
// 4. Includes `publicKey` and `encryptedData` in transact message
// 5. Sends the message
//
// Broadcaster:
// 1. Decrypts the `encryptedData` using Broadcaster privkey and `sharedKey` (if error, it's not addressed to us)
// 2. Processes transaction
// 3. Encrypts response (`txHash` or `error`) using `responseKey` (symmetric: AES-GCM-256)
// 4. Sends back encrypted response on transact-response: {encryptedData}
//
// Client:
// 1. Catches all `transact-response`'s after sending a transaction.
// 2. Decrypts each using the `responseKey`. (If error, not addressed to us)
// 3. After successful decryption, parses `txHash` or `error`.
//

enum BroadcastRetryState {
  RetryTransact = 'RetryTransact',
  Wait = 'Wait',
  Timeout = 'Timeout',
}

type BroadcastMessageData = {
  method: string;
  params: BroadcasterEncryptedMethodParams;
};

// NOTE: Broadcaster default transaction-send timeout is 45 seconds.
const SECONDS_PER_RETRY = 2;
const POLL_DELAY_SECONDS = 0.1;
const RETRY_TRANSACTION_SECONDS = 20;
const POST_ALERT_TOTAL_WAITING_SECONDS = 120;

export class BroadcasterTransaction {
  private messageData: BroadcastMessageData;
  private contentTopic: string;
  private txidVersionForInputs: TXIDVersion;
  private chain: Chain;
  private nullifiers: string[];

  private constructor(
    encryptedDataResponse: EncryptDataWithSharedKeyResponse,
    txidVersionForInputs: TXIDVersion,
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
    this.txidVersionForInputs = txidVersionForInputs;
    this.chain = chain;
    this.nullifiers = nullifiers;
    BroadcasterTransactResponse.setSharedKey(encryptedDataResponse.sharedKey);
  }

  static async create(
    txidVersionForInputs: TXIDVersion,
    to: string,
    data: string,
    broadcasterRailgunAddress: string,
    broadcasterFeesID: string,
    chain: Chain,
    nullifiers: string[],
    overallBatchMinGasPrice: bigint,
    useRelayAdapt: boolean,
    preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList,
  ): Promise<BroadcasterTransaction> {
    const encryptedDataResponse = await this.encryptTransaction(
      txidVersionForInputs,
      to,
      data,
      broadcasterRailgunAddress,
      broadcasterFeesID,
      chain,
      overallBatchMinGasPrice,
      useRelayAdapt,
      preTransactionPOIsPerTxidLeafPerList,
    );
    return new BroadcasterTransaction(
      encryptedDataResponse,
      txidVersionForInputs,
      chain,
      nullifiers,
    );
  }

  private static async encryptTransaction(
    txidVersionForInputs: TXIDVersion,
    to: string,
    data: string,
    broadcasterRailgunAddress: string,
    broadcasterFeesID: string,
    chain: Chain,
    overallBatchMinGasPrice: bigint,
    useRelayAdapt: boolean,
    preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList,
  ): Promise<EncryptDataWithSharedKeyResponse> {
    if (!isHexString(data)) {
      throw new Error('Data field must be a hex string.');
    }

    const { viewingPublicKey: broadcasterViewingKey } =
      getRailgunWalletAddressData(broadcasterRailgunAddress);

    const transactData: BroadcasterRawParamsTransact = {
      txidVersion: txidVersionForInputs,
      to: getAddress(to),
      data,
      broadcasterViewingKey: bytesToHex(broadcasterViewingKey),
      chainID: chain.id,
      chainType: chain.type,
      minGasPrice: overallBatchMinGasPrice.toString(),
      feesID: broadcasterFeesID,
      useRelayAdapt,
      devLog: BroadcasterConfig.IS_DEV,
      minVersion: BroadcasterConfig.MINIMUM_BROADCASTER_VERSION,
      maxVersion: BroadcasterConfig.MAXIMUM_BROADCASTER_VERSION,
      preTransactionPOIsPerTxidLeafPerList,
    };

    const encryptedDataResponse = await encryptDataWithSharedKey(
      transactData,
      broadcasterViewingKey,
    );

    return encryptedDataResponse;
  }

  private async findMatchingNullifierTxid(): Promise<Optional<string>> {
    try {
      const { txid } = await getCompletedTxidFromNullifiers(
        this.txidVersionForInputs,
        this.chain,
        this.nullifiers,
      );
      return txid;
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      BroadcasterDebug.error(
        new Error('Failed to find matching nullifier txid', { cause }),
      );
      return undefined;
    }
  }

  private async getTransactionResponse(): Promise<
    Optional<WakuTransactResponse>
  > {
    if (BroadcasterTransactResponse.storedTransactionResponse) {
      return BroadcasterTransactResponse.storedTransactionResponse;
    }

    const nullifiersTxid = await this.findMatchingNullifierTxid();
    if (isDefined(nullifiersTxid)) {
      return {
        id: 'nullifier-transaction',
        txHash: nullifiersTxid,
      };
    }

    return undefined;
  }

  private getBroadcastRetryState(retryNumber: number): BroadcastRetryState {
    const retrySeconds = retryNumber * SECONDS_PER_RETRY;
    if (retrySeconds <= RETRY_TRANSACTION_SECONDS) {
      return BroadcastRetryState.RetryTransact;
    }
    if (retrySeconds >= POST_ALERT_TOTAL_WAITING_SECONDS) {
      return BroadcastRetryState.Timeout;
    }
    return BroadcastRetryState.Wait;
  }

  async send(): Promise<string> {
    return this.broadcast();
  }

  private async broadcast(retryNumber = 0): Promise<string> {
    const broadcastRetryState = this.getBroadcastRetryState(retryNumber);
    switch (broadcastRetryState) {
      case BroadcastRetryState.RetryTransact:
        // 0-20 seconds.
        BroadcasterDebug.log(
          `Broadcast Waku message: ${this.messageData.method} via ${this.contentTopic}`,
        );
        await WakuBroadcasterWakuCore.broadcastMessage(
          this.messageData,
          this.contentTopic,
        );
        break;
      case BroadcastRetryState.Wait:
        // 21-60 seconds.
        // Do nothing.
        break;
      case BroadcastRetryState.Timeout:
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
    if (isDefined(response)) {
      if (isDefined(response.txHash)) {
        BroadcasterTransactResponse.clearSharedKey();
        return response.txHash;
      }
      if (isDefined(response.error)) {
        BroadcasterTransactResponse.clearSharedKey();
        throw new Error(response.error, {
          cause: new Error('Received response error from broadcaster.'),
        });
      }
    }

    // Retry.
    return this.broadcast(retryNumber + 1);
  }
}
