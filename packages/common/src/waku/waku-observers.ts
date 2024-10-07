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
  decoder: IDecoder<any> | IDecoder<any>[]; // unique to each contentTopic
  callback: (message: any) => void; // unique to each contentTopic
};

export class WakuObservers {
  private static pubsubSubscription: IFilterSubscription;
  private static currentChain: Optional<Chain>;
  private static currentSubscriptions: Map<
    string, // unique contentTopic as the key
    SubscriptionParams // contains decoder, callback, and created subscription
  > = new Map();

  static setObserversForChain = async (
    waku: Optional<LightNode>,
    chain: Chain,
  ) => {
    BroadcasterDebug.log('Setting observers for chain');
    console.log(
      `Existing state of WakuObservers: 
      currentChain: ${WakuObservers.currentChain}, 
      currentSubscriptions: ${WakuObservers.currentSubscriptions}`,
    );

    if (!waku) {
      BroadcasterDebug.log(
        'No waku instance passed in to setObserversForChain',
      );
      return;
    }

    // If the chain set in WakuObservers does not match the chain being passed in
    if (
      WakuObservers.currentChain &&
      compareChains(WakuObservers.currentChain, chain)
    ) {
      BroadcasterDebug.log(
        'Chain passed in does not match chain set in WakuObservers',
      );
      return;
    }

    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );
    WakuObservers.currentChain = chain;

    // Create the pubsubSubscription used for each contentTopic subscription
    WakuObservers.pubsubSubscription = await waku.filter.createSubscription(
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );

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
    if (!isDefined(WakuObservers.pubsubSubscription)) {
      BroadcasterDebug.log(
        'No waku instance found, Transport Subscription not added.',
      );
      return;
    }

    // Check if any subscriptions exist
    if (WakuObservers.currentSubscriptions.size !== 0) {
      // If they do, get the pubsubTopic and unsubscribe from all subscriptions
      // TODO catch unsubscribe error? cuz if fails it might still remove from array even though not done yet
      await this.pubsubSubscription.unsubscribeAll();

      // Clear the current subscriptions
      WakuObservers.currentSubscriptions.clear();
    } else {
      BroadcasterDebug.log('No subscriptions to remove');
    }
  };

  private static getDecodersForChain = (chain: Chain) => {
    // Get the fees contentTopic and create its decoder/callback
    const contentTopicFees = contentTopics.fees(chain);
    const feesDecoder = createDecoder(
      contentTopicFees,
      WAKU_RAILGUN_PUB_SUB_TOPIC,
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
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );
    const transactResponseCallback =
      BroadcasterTransactResponse.handleBroadcasterTransactionResponseMessage;
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

    // Create a subscription based on the pubsub topic
    const pubsubSubscription = await waku.filter.createSubscription(
      WAKU_RAILGUN_PUB_SUB_TOPIC,
    );

    try {
      // Subscribe to the pubsub topic with the transportTopic's decoder and callback
      pubsubSubscription.subscribe(decoder, callback);

      // Store the subscription
      WakuObservers.currentSubscriptions.set(transportTopic, {
        decoder: decoder,
        callback: callback,
      });

      BroadcasterDebug.log(`Subscribed to ${transportTopic}`);
      console.log(
        'current subscriptions: ',
        WakuObservers.currentSubscriptions,
      );
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

    // Get all topics and their decoders/callbacks for the chain
    const preparedTopics = WakuObservers.getDecodersForChain(chain);

    // For every
    for (const preparedTopic of preparedTopics) {
      console.log('preparedTopic: ', preparedTopic);

      // Get the relating decoder and callback for the topic
      const { decoder, callback } = preparedTopic;
      BroadcasterDebug.log(`Subscribing to ${preparedTopic.topic}`);

      const pubsubSubscription = await waku.filter.createSubscription(
        WAKU_RAILGUN_PUB_SUB_TOPIC,
      );

      try {
        // Subscribe to the topic
        pubsubSubscription.subscribe(decoder, callback);

        // Store the subscription
        WakuObservers.currentSubscriptions.set(preparedTopic.topic, {
          decoder: decoder,
          callback: callback,
        });

        BroadcasterDebug.log(`Subscribed to ${preparedTopic.topic}`);
        console.log(
          'current subscriptions: ',
          WakuObservers.currentSubscriptions,
        );
      } catch (err) {
        BroadcasterDebug.log(
          `Error subscribing to ${preparedTopic.topic}: ${err}`,
        );
      }
    }
  }

  static getCurrentContentTopics(): string[] {
    // Get all content topics from the current subscriptions
    const contentTopics = Array.from(WakuObservers.currentSubscriptions.keys());
    return contentTopics;
  }

  static getCurrentTopicSubscriptions(): Map<string, SubscriptionParams> {
    console.log(
      'getCurrentSubscriptions(): ',
      WakuObservers.currentSubscriptions,
    );
    return WakuObservers.currentSubscriptions;
  }

  static getCurrentPubsubSubscription(): Optional<IFilterSubscription> {
    return WakuObservers.pubsubSubscription;
  }

  static async getCurrentChain(): Promise<Optional<Chain>> {
    return WakuObservers.currentChain;
  }
}
