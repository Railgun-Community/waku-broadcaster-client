import {
  Chain,
  compareChains,
  isDefined,
  delay,
} from '@railgun-community/shared-models';
import { ISubscription, LightNode, createDecoder, IMessage } from '@waku/sdk';
import { handleBroadcasterFeesMessage } from '../../../fees/handle-fees-message.js';
import { WAKU_RAILGUN_DEFAULT_SHARD } from '../../../models/constants.js';
import { BroadcasterTransactResponse } from '../../../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../../../utils/broadcaster-debug.js';
import { contentTopics } from '../../../waku/waku-topics.js';

export class WakuLightSubscriptions {
  private static currentChain: Optional<Chain>;
  private static currentTopicsWithSubscriptions: Map<string, ISubscription> =
    new Map();

  static async createSubscriptionsForChain(
    waku: LightNode,
    chain: Chain,
  ): Promise<void> {
    if (!waku) {
      BroadcasterDebug.log(
        'No waku instance passed in to createSubscriptionsForChain()',
      );
      return;
    }

    if (
      WakuLightSubscriptions.currentChain &&
      compareChains(WakuLightSubscriptions.currentChain, chain)
    ) {
      BroadcasterDebug.log(
        `${chain.id} chain is already set in createSubscriptionsForChain(). Skipping.`,
      );
      return;
    }

    WakuLightSubscriptions.currentChain = chain;
    await WakuLightSubscriptions.removeAllSubscriptions(waku);
    await WakuLightSubscriptions.addSubscriptions(chain, waku);

    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  }

  static resetCurrentChain(): void {
    BroadcasterDebug.log('Resetting current chain');
    WakuLightSubscriptions.currentChain = undefined;
  }

  static async pollSubscriptionsHealth(waku: LightNode): Promise<void> {
    BroadcasterDebug.log(
      `WAKU Health Status: ${waku?.health.getHealthStatus()}`,
    );

    if (isDefined(WakuLightSubscriptions.currentTopicsWithSubscriptions)) {
      if (WakuLightSubscriptions.currentTopicsWithSubscriptions.size === 0) {
        BroadcasterDebug.log('No subscriptions to ping');
        throw new Error('No subscriptions to ping');
      }
    }
    await delay(15 * 1000);
    WakuLightSubscriptions.pollSubscriptionsHealth(waku);
  }

  static async addTransportSubscription(
    waku: LightNode,
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
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_DEFAULT_SHARD);
    const subscriptionResult = await waku.filter.subscribe(decoder, callback);

    if (subscriptionResult.error) {
      throw new Error(subscriptionResult.error);
    }

    WakuLightSubscriptions.currentTopicsWithSubscriptions.set(
      transportTopic,
      subscriptionResult.subscription,
    );

    BroadcasterDebug.log(`Subscribed to ${transportTopic}`);
  }

  static getCurrentContentTopics(): string[] {
    return Array.from(
      WakuLightSubscriptions.currentTopicsWithSubscriptions.keys(),
    );
  }

  static async removeAllSubscriptions(waku: LightNode): Promise<void> {
    if (!isDefined(waku?.lightPush)) {
      BroadcasterDebug.log(
        'No waku instance found, cannot remove subscriptions',
      );
      return;
    }

    if (isDefined(this.currentTopicsWithSubscriptions)) {
      for (const [topic, subscription] of this.currentTopicsWithSubscriptions) {
        BroadcasterDebug.log(`Unsubscribing from ${topic}`);
        await subscription.unsubscribe([topic]);
      }
      this.currentTopicsWithSubscriptions.clear();
    } else {
      BroadcasterDebug.log('No subscriptions to remove');
    }
  }

  private static async addSubscriptions(
    chain: Optional<Chain>,
    waku: Optional<LightNode>,
  ) {
    if (!isDefined(chain) || !isDefined(waku)) {
      BroadcasterDebug.log('AddSubscription: No Waku or Chain defined.');
      return;
    }

    // Get all topics and their decoders/callbacks for the chain
    const preparedTopics = WakuLightSubscriptions.getDecodersForChain(chain);

    // Filter out topics that already exist
    const newTopics = preparedTopics.filter(
      params =>
        !WakuLightSubscriptions.currentTopicsWithSubscriptions.has(
          params.topic,
        ),
    );

    // Subscribe to each prepared topic using their respective decoder and callback
    for (const preparedTopic of newTopics) {
      // Get the relating decoder and callback for the topic
      const { decoder, callback } = preparedTopic;

      BroadcasterDebug.log(`Subscribing to ${preparedTopic.topic}`);
      const subscriptionResult = await waku.filter.subscribe(decoder, callback);

      if (subscriptionResult.error) {
        BroadcasterDebug.log(`Error subscribing to ${preparedTopic.topic}`);

        // Skip to the next topic
        continue;
      }

      // Store the subscription if successful
      WakuLightSubscriptions.currentTopicsWithSubscriptions.set(
        preparedTopic.topic,
        subscriptionResult.subscription,
      );

      BroadcasterDebug.log(`Subscribed to ${preparedTopic.topic}`);
    }
  }

  private static getDecodersForChain(chain: Chain) {
    const contentTopicFees = contentTopics.fees(chain);
    const feesDecoder = createDecoder(
      contentTopicFees,
      WAKU_RAILGUN_DEFAULT_SHARD,
    );
    const feesCallback = (message: IMessage) =>
      handleBroadcasterFeesMessage(chain, message, contentTopicFees);
    const feesSubscriptionParams = {
      topic: contentTopicFees,
      decoder: feesDecoder,
      callback: feesCallback,
    };

    const contentTopicTransactResponse = contentTopics.transactResponse(chain);
    const transactResponseDecoder = createDecoder(
      contentTopicTransactResponse,
      WAKU_RAILGUN_DEFAULT_SHARD,
    );
    const transactResponseCallback =
      BroadcasterTransactResponse.handleBroadcasterTransactionResponseMessage;
    const transactResponseSubscriptionParams = {
      topic: contentTopicTransactResponse,
      decoder: transactResponseDecoder,
      callback: transactResponseCallback,
    };

    return [feesSubscriptionParams, transactResponseSubscriptionParams];
  }
}
