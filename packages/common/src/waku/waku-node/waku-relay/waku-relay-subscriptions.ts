import { Chain, isDefined } from '@railgun-community/shared-models';
import { Unsubscribe, RelayNode, createDecoder, IMessage } from '@waku/sdk';
import { handleBroadcasterFeesMessage } from '../../../fees/handle-fees-message.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../../../models/constants.js';
import { BroadcasterTransactResponse } from '../../../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../../../utils/broadcaster-debug.js';
import { contentTopics } from '../../../waku/waku-topics.js';

export class WakuRelaySubscriptions {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static unsubscribes: Unsubscribe[] = [];

  static async createSubscriptionsForChain(
    waku: RelayNode,
    chain: Chain,
  ): Promise<void> {
    if (!waku) {
      BroadcasterDebug.log(
        'No waku instance found in createSubscriptionsForChain',
      );
      return;
    }

    if (WakuRelaySubscriptions.currentChain !== chain) {
      BroadcasterDebug.log(
        `Setting observers for new chain: ${chain.type}:${chain.id}, current chain: ${WakuRelaySubscriptions.currentChain?.type}:${WakuRelaySubscriptions.currentChain?.id}`,
      );
      WakuRelaySubscriptions.currentChain = chain;
    }

    await WakuRelaySubscriptions.removeAllSubscriptions(waku);
    await WakuRelaySubscriptions.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  }

  static resetCurrentChain(): void {
    this.currentChain = undefined;
  }

  static getCurrentContentTopics(): string[] {
    return this.currentContentTopics;
  }

  static async removeAllSubscriptions(_waku: RelayNode): Promise<void> {
    for (const unsubscribe of this.unsubscribes ?? []) {
      BroadcasterDebug.log(
        `removeAllSubscriptions() unsubscribing: ${unsubscribe}`,
      );
      await unsubscribe();
    }
    this.currentContentTopics = [];
    this.unsubscribes = [];
  }

  static async addTransportSubscription(
    waku: RelayNode,
    topic: string,
    callback: (message: any) => void,
  ): Promise<void> {
    if (!isDefined(waku)) {
      BroadcasterDebug.log(
        'No waku instance found, Transport Subscription not added.',
      );
      return;
    }
    const transportTopic = contentTopics.encrypted(topic);
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_PUB_SUB_TOPIC);
    const unsubscribe = await waku.relay.subscribeWithUnsubscribe(
      decoder,
      callback,
    );
    this.unsubscribes.push(unsubscribe);
    this.currentContentTopics.push(transportTopic);
  }

  private static async addChainObservers(
    waku: RelayNode,
    chain: Chain,
  ): Promise<void> {
    if (!isDefined(waku.relay)) {
      BroadcasterDebug.log('No waku relay instance found in addChainObservers');
      return;
    }

    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );

    await WakuRelaySubscriptions.addSubscriptions(chain, waku).catch(err => {
      BroadcasterDebug.log(`Error adding Observers. ${err.message}`);
    });

    const currentContentTopics =
      WakuRelaySubscriptions.getCurrentContentTopics();
    BroadcasterDebug.log(`Current Content Topics: ${currentContentTopics}`);

    for (const observer of currentContentTopics) {
      BroadcasterDebug.log(`Observer: ${observer}`);
    }
  }

  private static async addSubscriptions(
    chain: Chain,
    waku: RelayNode,
  ): Promise<void> {
    if (!isDefined(chain)) {
      BroadcasterDebug.log('No chain found in addSubscriptions');
      return;
    } else if (!isDefined(waku)) {
      BroadcasterDebug.log('No waku instance found in addSubscriptions');
      return;
    }

    const subscriptionParams =
      WakuRelaySubscriptions.getDecodersForChain(chain);
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(
      topic => !this.currentContentTopics.includes(topic),
    );
    this.currentContentTopics.push(...newTopics);

    for (const subParam of subscriptionParams) {
      const { decoder, callback } = subParam;
      const unsubscribe = await waku.relay.subscribeWithUnsubscribe(
        decoder,
        callback,
      );
      this.unsubscribes.push(unsubscribe);
    }
  }

  private static getDecodersForChain(chain: Chain) {
    const contentTopicFees = contentTopics.fees(chain);
    const contentTopicTransactResponse = contentTopics.transactResponse(chain);

    const feesDecoder = createDecoder(
      contentTopicFees,
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );
    const transactResponseDecoder = createDecoder(
      contentTopicTransactResponse,
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );

    const feesCallback = (message: IMessage) =>
      handleBroadcasterFeesMessage(chain, message, contentTopicFees);
    const transactResponseCallback =
      BroadcasterTransactResponse.handleBroadcasterTransactionResponseMessage;

    return [
      {
        topic: contentTopicFees,
        decoder: feesDecoder,
        callback: feesCallback,
      },
      {
        topic: contentTopicTransactResponse,
        decoder: transactResponseDecoder,
        callback: transactResponseCallback,
      },
    ];
  }
}
