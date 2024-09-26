import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { contentTopics } from './waku-topics.js';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';
import { BroadcasterConnectionStatusCallback } from 'models/export-models.js';
import { WakuBroadcasterClient } from '../waku-broadcaster-client.js';
import { createDecoder, IDecoder, IMessage, ISubscriptionSDK, LightNode } from '@waku/sdk';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
};

interface ISubscriptionSDKExtended extends ISubscriptionSDK {
  decoder: IDecoder<any>;
  callback: (message: any) => void;
}

export class WakuObservers {
  static pollDelay = 3000;

  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions: ISubscriptionSDKExtended[] = [];
  static subscribedPeers: string[] = [];

  static setObserversForChain = async (
    waku: Optional<LightNode>,
    chain: Chain,
  ) => {
    if (!waku) {
      BroadcasterDebug.log('No waku instance found in setObserversForChain()');
      return;
    }
    if (
      WakuObservers.currentChain &&
      compareChains(WakuObservers.currentChain, chain)
    ) {
      BroadcasterDebug.log(
        `Chain already set for Waku observers: ${chain.type}:${chain.id}`,
      );
      return;
    }

    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );
    // Set the current chain
    WakuObservers.currentChain = chain;

    // Remove all existing observers
    await WakuObservers.removeAllObservers();

    // Add observers for the new chain
    await WakuObservers.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    this.currentChain = undefined;
  };

  static removeAllObservers = async () => {
    for (const subscription of this.currentSubscriptions ?? []) {
      await subscription.unsubscribeAll();
    }
    this.currentContentTopics = [];
    this.currentSubscriptions = [];
  };

  private static getDecodersForChain = (chain: Chain) => {
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

    const feesSubscriptionParams = {
      topic: contentTopicFees,
      decoder: feesDecoder,
      callback: feesCallback,
    };
    const transactResponseSubscriptionParams = {
      topic: contentTopicTransactResponse,
      decoder: transactResponseDecoder,
      callback: transactResponseCallback,
    };
    return [feesSubscriptionParams, transactResponseSubscriptionParams];
  };

  private static addChainObservers = async (waku: LightNode, chain: Chain) => {
    if (!isDefined(waku.lightPush)) {
      BroadcasterDebug.log(
        'No lightPush instance found in addChainObservers()',
      );
      return;
    }

    await WakuObservers.addSubscriptions(chain, waku).catch(err => {
      BroadcasterDebug.log(`Error adding Observers. ${err.message}`);
    });

    // Log current list of observers
    const currentContentTopics = WakuObservers.getCurrentContentTopics();
    BroadcasterDebug.log('Waku content topics:');
    for (const observer of currentContentTopics) {
      BroadcasterDebug.log(observer);
    }
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
    const transportTopic = contentTopics.encrypted(topic);
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_PUB_SUB_TOPIC);
    const { subscription, error } = await waku.filter.subscribe(
      decoder,
      callback,
    );

    if (subscription) {
      this.currentSubscriptions.push({
        ...subscription,
        decoder,
        callback,
      });
    } else {
      BroadcasterDebug.log(
        `Error subscribing to topic ${transportTopic}: ${error}`,
      );
      return;
    }
    this.currentContentTopics.push(transportTopic);
  }

  private static async addSubscriptions(
    chain: Optional<Chain>,
    waku: Optional<LightNode>,
  ) {
    if (!isDefined(chain) || !isDefined(waku)) {
      BroadcasterDebug.log('AddSubscription: No Waku or Chain defined.');
      return;
    }

    // Get the decoders and callbacks for the chain
    const subscriptionParams = WakuObservers.getDecodersForChain(chain);

    // Get the topics for the chain
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(
      topic => !this.currentContentTopics.includes(topic),
    );
    this.currentContentTopics.push(...newTopics);

    // Subscribe to the topics
    for (const subParam of subscriptionParams) {
      const { decoder, callback } = subParam;
      BroadcasterDebug.log(`Subscribing to topic: ${subParam.topic}`);

      // TODO: add custom pubsub topic to subscription
      const { error, subscription } = await waku.filter.

        `Error: ${error}, Subscription: ${subscription}`,
      );

      if (subscription) {
        // Add subscription to array with decoder and callback that was used
        this.currentSubscriptions.push({
          ...subscription,
          decoder,
          callback,
        });
      } else {
        BroadcasterDebug.log(
          `Error subscribing to topic ${subParam.topic}: ${error}`,
        );
      }
    }
  }

  /**
   * Start keep-alive poller which checks Broadcaster status every few seconds.
   */
  static async poller(
    statusCallback: BroadcasterConnectionStatusCallback,
  ): Promise<void> {
    console.log('Polling broadcaster status');

    if (!this.currentChain) {
      BroadcasterDebug.log('No current chain found in poller');
      return;
    }

    // Ping subscriptions to keep them alive
    for (const subscription of this.currentSubscriptions) {
      try {
        // Ping the subscription
        await subscription.ping();
      } catch (error) {
        if (
          // Check if the error message includes "peer has no subscriptions"
          error instanceof Error &&
          error.message.includes('peer has no subscriptions')
        ) {
          const extendedSubscription = subscription as ISubscriptionSDKExtended;
          // Reinitiate the subscription if the ping fails
          await extendedSubscription.subscribe(
            extendedSubscription.decoder,
            extendedSubscription.callback,
          );
        } else {
          throw error;
        }
      }
    }

    // Update the status
    WakuBroadcasterClient.updateStatus();

    await delay(this.pollDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.poller(statusCallback);
  }

  static getCurrentContentTopics(): string[] {
    return this.currentContentTopics;
  }
}
