import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { contentTopics } from './waku-topics.js';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';
import {
  IDecoder,
  IFilterSubscription,
  LightNode,
  createDecoder,
  IMessage,
} from '@waku/sdk';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
};

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions: Map<
    IFilterSubscription,
    SubscriptionParams
  > = new Map();
  static setObserversForChain = async (
    waku: Optional<LightNode>,
    chain: Chain,
  ) => {
    BroadcasterDebug.log('Setting observers for chain');

    if (!waku) {
      BroadcasterDebug.log(
        'No waku instance passed in to setObserversForChain',
      );
      return;
    }

    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );
    WakuObservers.currentChain = chain;

    await WakuObservers.removeAllObservers();
    await WakuObservers.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    BroadcasterDebug.log('Resetting current chain');

    WakuObservers.currentChain = undefined;
  };

  static removeAllObservers = async () => {
    if (WakuObservers.currentSubscriptions.size === 0) {
      BroadcasterDebug.log(
        'No current subscriptions found in removeAllObservers()',
      );
      return;
    }

    for (const [subscription] of WakuObservers.currentSubscriptions.entries()) {
      // Unsubscribe from all subscriptions and their topics
      await subscription.unsubscribe(WakuObservers.currentContentTopics);
    }

    // Clear the current subscriptions
    WakuObservers.currentContentTopics = [];
    WakuObservers.currentSubscriptions = new Map();
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

  static subscribedPeers: string[] = [];

  private static addChainObservers = async (waku: LightNode, chain: Chain) => {
    if (!isDefined(waku.filter)) {
      BroadcasterDebug.log('No waku filter found in addChainObservers');
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

    // This never actually returns the expected type
    const subscription = await waku.filter.createSubscription(
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );

    try {
      // Subscribe to the topic
      subscription.subscribe(decoder, callback);

      // Store the subscription
      WakuObservers.currentSubscriptions.set(subscription, {
        topic: transportTopic,
        decoder,
        callback,
      });

      BroadcasterDebug.log(`Subscribed to ${transportTopic}`);
    } catch (err) {
      // Let the poller retry subscribing
      BroadcasterDebug.log(`Error subscribing to ${transportTopic}: ${err}`);
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

    const subscriptionParams = WakuObservers.getDecodersForChain(chain);
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(
      topic => !WakuObservers.currentContentTopics.includes(topic),
    );
    WakuObservers.currentContentTopics.push(...newTopics);

    for (const subParam of subscriptionParams) {
      const { decoder, callback } = subParam;

      BroadcasterDebug.log(`Subscribing to ${subParam.topic}`);

      const subscription = await waku.filter.createSubscription(
        WAKU_RAILGUN_PUB_SUB_TOPIC,
      );

      try {
        // Subscribe to the topic
        subscription.subscribe(decoder, callback);

        // Store the subscription
        WakuObservers.currentSubscriptions.set(subscription, subParam);

        BroadcasterDebug.log(`Subscribed to ${subParam.topic}`);
      } catch (err) {
        BroadcasterDebug.log(`Error subscribing to ${subParam.topic}: ${err}`);
      }
    }
  }

  static getCurrentContentTopics(): string[] {
    return WakuObservers.currentContentTopics;
  }

  static getCurrentSubscriptions(): Map<
    IFilterSubscription,
    SubscriptionParams
  > {
    console.log('current subscriptions: ', WakuObservers.currentSubscriptions);
    return WakuObservers.currentSubscriptions;
  }

  static async getCurrentChain(): Promise<Optional<Chain>> {
    return WakuObservers.currentChain;
  }
}
