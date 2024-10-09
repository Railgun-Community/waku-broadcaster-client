/**
 * Waku Subscriptions
 *
 * This module subscribes to content topics on Waku so the client and send and receive messages.
 *
 * Subscriptions are created per content topic.
 * Subscriptions are stored so they can be pinged for health or unsubscribed from.
 */

import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { contentTopics } from './waku-topics.js';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_DEFAULT_SHARD } from '../models/constants.js';
import {
  LightNode,
  createDecoder,
  IMessage,
  ISubscriptionSDK,
} from '@waku/sdk';

export class WakuSubscriptions {
  // Ensure only one chain is set at a time
  private static currentChain: Optional<Chain>;

  // Store topics and their subscriptions for pinging and unsubscribing
  private static currentTopicsWithSubscriptions: Map<
    string, // key is the unique contentTopic
    ISubscriptionSDK // value is the matching subscription
  > = new Map();

  static createSubscriptionsForChain = async (
    waku: Optional<LightNode>,
    chain: Chain,
  ) => {
    if (!waku) {
      BroadcasterDebug.log(
        'No waku instance passed in to setSubscriptionsForChain()',
      );
      return;
    }

    if (
      WakuSubscriptions.currentChain &&
      compareChains(WakuSubscriptions.currentChain, chain)
    ) {
      BroadcasterDebug.log(
        `${chain.id} chain is already set in setSubscriptionsForChain(). Skipping.`,
      );
      return;
    }

    // Store the new chain
    WakuSubscriptions.currentChain = chain;

    // Remove existing subscriptions (if any in case of new chain / initial startup)
    await WakuSubscriptions.removeAllSubscriptions(waku);

    // Add new subscriptions
    await WakuSubscriptions.addSubscriptions(chain, waku);

    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    BroadcasterDebug.log('Resetting current chain');
    WakuSubscriptions.currentChain = undefined;
  };

  /**
   * Poll subscription health and log it every 15 seconds
   *
   * @param waku Waku instance
   */
  static pollSubscriptionsHealth = async (waku: Optional<LightNode>) => {
    BroadcasterDebug.log(
      `WAKU Health Status: ${waku?.health.getHealthStatus()}`,
    );

    // Check if any subscriptions exist
    if (isDefined(WakuSubscriptions.currentTopicsWithSubscriptions)) {
      if (WakuSubscriptions.currentTopicsWithSubscriptions.size === 0) {
        BroadcasterDebug.log('No subscriptions to ping');
        throw new Error('No subscriptions to ping');
      }
    }
    await delay(15 * 1000);
    WakuSubscriptions.pollSubscriptionsHealth(waku);
  };

  static async addTransportSubscription(
    waku: Optional<LightNode>,
    topic: string,
    callback: (message: any) => void,
  ): Promise<void> {
    if (!isDefined(waku)) {
      BroadcasterDebug.log(
        'No waku instance found, Transport Subscription not added.',
      );
      return;
    }

    // Get the topic and create a decoder using the default shard assigned to Railgun
    const transportTopic = contentTopics.encrypted(topic);
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_DEFAULT_SHARD);

    // Subscribe and get the subscription object back
    const subscriptionResult = await waku.filter.subscribe(decoder, callback);

    // Check if subscribing to the topic failed
    if (subscriptionResult.error) {
      throw new Error(subscriptionResult.error);
    }

    // Store the subscription
    WakuSubscriptions.currentTopicsWithSubscriptions.set(
      transportTopic,
      subscriptionResult.subscription,
    );

    BroadcasterDebug.log(`Subscribed to ${transportTopic}`);
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
    const preparedTopics = WakuSubscriptions.getDecodersForChain(chain);

    // Filter out topics that already exist
    const newTopics = preparedTopics.filter(
      params =>
        !WakuSubscriptions.currentTopicsWithSubscriptions.has(params.topic),
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
      WakuSubscriptions.currentTopicsWithSubscriptions.set(
        preparedTopic.topic,
        subscriptionResult.subscription,
      );

      BroadcasterDebug.log(`Subscribed to ${preparedTopic.topic}`);
    }
  }

  private static removeAllSubscriptions = async (waku: Optional<LightNode>) => {
    if (!isDefined(waku?.lightPush)) {
      BroadcasterDebug.log(
        'No waku instance found, cannot remove subscriptions',
      );
      return;
    }

    if (isDefined(this.currentTopicsWithSubscriptions)) {
      // Get each topic and subscription to call unsubscribe
      for (const [topic, subscription] of this.currentTopicsWithSubscriptions) {
        BroadcasterDebug.log(`Unsubscribing from ${topic}`);
        await subscription.unsubscribe([topic]);
      }

      // Clear the subscriptions
      this.currentTopicsWithSubscriptions.clear();
    } else {
      BroadcasterDebug.log('No subscriptions to remove');
    }
  };

  private static getDecodersForChain = (chain: Chain) => {
    // Get the fees contentTopic and create its decoder/callback
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

    // Get the transact response contentTopic and create its decoder/callback
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

    // Return the prepared topics with their decoder/callback
    return [feesSubscriptionParams, transactResponseSubscriptionParams];
  };
}
