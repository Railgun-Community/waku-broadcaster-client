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

interface IFilterSubscriptionExtended extends IFilterSubscription {
  decoder: IDecoder<any>;
  callback: (message: any) => void;
}

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions: IFilterSubscriptionExtended[] = [];
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
    for (const subscription of WakuObservers.currentSubscriptions ?? []) {
      await subscription.unsubscribe(WakuObservers.currentContentTopics);
    }
    WakuObservers.currentContentTopics = [];
    WakuObservers.currentSubscriptions = [];
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

    BroadcasterDebug.log(`Subscription: ${subscription}`);
    BroadcasterDebug.log(
      `Subscription subscribe method: ${subscription.subscribe}`,
    );

    // Subscribe
    subscription.subscribe(decoder, callback);

    if (subscription === undefined || subscription === null) {
      BroadcasterDebug.log(
        'Failed to subscribe to waku filter in addTransportSubscription',
      );
      return;
    } else {
      WakuObservers.currentSubscriptions.push({
        ...subscription,
        decoder,
        callback,
      });

      BroadcasterDebug.log(
        `currentSubscriptions: ${WakuObservers.currentSubscriptions}`,
      );
    }
    WakuObservers.currentContentTopics.push(transportTopic);
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

      // TODO what is up with this subscription object not having subscribe method when stored in array

      // Log the subscription object to verify its structure
      console.log('subscription: ', subscription);
      console.log('subscription.subscribe: ', subscription.subscribe);

      // Check object's own properties
      console.log(
        'subscription own properties: ',
        Object.getOwnPropertyNames(subscription),
      );

      // Check prototype chain
      console.log(
        'subscription prototype: ',
        Object.getPrototypeOf(subscription),
      );

      // Try subscribing to topic
      try {
        subscription.subscribe(decoder, callback);

        const extendedSubscription: IFilterSubscriptionExtended = {
          ...subscription,
          decoder,
          callback,
        };

        console.log('extendedSubscription: ', extendedSubscription);

        WakuObservers.currentSubscriptions.push(extendedSubscription);

        BroadcasterDebug.log(
          `currentSubscriptions: ${WakuObservers.currentSubscriptions}`,
        );
      } catch (err) {
        BroadcasterDebug.log(`Error subscribing to ${subParam.topic}: ${err}`);
      }
    }
  }

  static getCurrentContentTopics(waku?: LightNode): string[] {
    return WakuObservers.currentContentTopics;
  }

  static getCurrentSubscriptions(): IFilterSubscriptionExtended[] {
    console.log('current subscriptions: ', WakuObservers.currentSubscriptions);
    return WakuObservers.currentSubscriptions;
  }

  static async getCurrentChain(): Promise<Optional<Chain>> {
    return WakuObservers.currentChain;
  }
}
