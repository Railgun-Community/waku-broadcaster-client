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
  RelayerEncryptedMethodParams,
  RelayerRawParamsTransact,
  TXIDVersion,
} from '@railgun-community/shared-models';
import { RelayerConfig } from '../models/relayer-config.js';
import { bytesToHex } from '../utils/conversion.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core.js';
import { contentTopics } from '../waku/waku-topics.js';
import {
  WakuTransactResponse,
  RelayerTransactResponse,
} from './relayer-transact-response.js';
import { getAddress, isHexString } from 'ethers';

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
  params: RelayerEncryptedMethodParams;
};

// NOTE: Relayer default transaction-send timeout is 45 seconds.
const SECONDS_PER_RETRY = 12;
const POLL_DELAY_SECONDS = 0.2;
const RETRY_TRANSACTION_SECONDS = 45;
const POST_ALERT_TOTAL_WAITING_SECONDS = 220;

export class RelayerTransaction {
  private messageData: RelayMessageData;
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
    RelayerTransactResponse.setSharedKey(encryptedDataResponse.sharedKey);
  }

  static async create(
    txidVersionForInputs: TXIDVersion,
    to: string,
    data: string,
    relayerRailgunAddress: string,
    relayerFeesID: string,
    chain: Chain,
    nullifiers: string[],
    overallBatchMinGasPrice: bigint,
    useRelayAdapt: boolean,
    preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList,
  ): Promise<RelayerTransaction> {
    const encryptedDataResponse = await this.encryptTransaction(
      txidVersionForInputs,
      to,
      data,
      relayerRailgunAddress,
      relayerFeesID,
      chain,
      overallBatchMinGasPrice,
      useRelayAdapt,
      preTransactionPOIsPerTxidLeafPerList,
    );
    return new RelayerTransaction(
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
    relayerRailgunAddress: string,
    relayerFeesID: string,
    chain: Chain,
    overallBatchMinGasPrice: bigint,
    useRelayAdapt: boolean,
    preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList,
  ): Promise<EncryptDataWithSharedKeyResponse> {
    if (!isHexString(data)) {
      throw new Error('Data field must be a hex string.');
    }

    const { viewingPublicKey: relayerViewingKey } = getRailgunWalletAddressData(
      relayerRailgunAddress,
    );

    const transactData: RelayerRawParamsTransact = {
      txidVersion: txidVersionForInputs,
      to: getAddress(to),
      data,
      relayerViewingKey: bytesToHex(relayerViewingKey),
      chainID: chain.id,
      chainType: chain.type,
      minGasPrice: overallBatchMinGasPrice.toString(),
      feesID: relayerFeesID,
      useRelayAdapt,
      devLog: RelayerConfig.IS_DEV,
      minVersion: RelayerConfig.MINIMUM_RELAYER_VERSION,
      maxVersion: RelayerConfig.MAXIMUM_RELAYER_VERSION,
      preTransactionPOIsPerTxidLeafPerList,
    };

    const encryptedDataResponse = await encryptDataWithSharedKey(
      transactData,
      relayerViewingKey,
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
      RelayerDebug.error(
        new Error('Failed to find matching nullifier txid', { cause }),
      );
      return undefined;
    }
  }

  private async getTransactionResponse(): Promise<
    Optional<WakuTransactResponse>
  > {
    if (RelayerTransactResponse.storedTransactionResponse) {
      return RelayerTransactResponse.storedTransactionResponse;
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

  private getRelayRetryState(retryNumber: number): RelayRetryState {
    const retrySeconds = retryNumber * SECONDS_PER_RETRY;
    if (retrySeconds <= RETRY_TRANSACTION_SECONDS) {
      return RelayRetryState.RetryTransact;
    }
    if (retrySeconds >= POST_ALERT_TOTAL_WAITING_SECONDS) {
      return RelayRetryState.Timeout;
    }
    return RelayRetryState.Wait;
  }

  async send(): Promise<string> {
    return this.relay();
  }

  private async relay(retryNumber = 0): Promise<string> {
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
    if (isDefined(response)) {
      if (isDefined(response.txHash)) {
        RelayerTransactResponse.clearSharedKey();
        return response.txHash;
      }
      if (isDefined(response.error)) {
        RelayerTransactResponse.clearSharedKey();
        throw new Error('Failed to relay transaction on Waku', {
          cause: new Error(response.error),
        });
      }
    }

    // Retry.
    return this.relay(retryNumber + 1);
  }
}
