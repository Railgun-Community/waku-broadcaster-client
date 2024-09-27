import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics.js';
import {
  IMessage,
  IFilterSubscription,
  IDecoder,
  RelayNode,
  Unsubscribe,
} from '@waku/interfaces';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
};

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static unsubscribes: Unsubscribe[] = [];

  static setObserversForChain = async (
    waku: Optional<RelayNode>,
    chain: Chain,
  ) => {
    if (!waku) {
      BroadcasterDebug.log('No waku instance found in setObserversForChain');
      return;
    }

    if (WakuObservers.currentChain !== chain) {
      BroadcasterDebug.log('Resetting current chain');
      WakuObservers.currentChain = chain;
      return;
    }

    // Remove existing connections and add new ones
    await WakuObservers.removeAllObservers();
    await WakuObservers.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    this.currentChain = undefined;
  };

  static removeAllObservers = async () => {
    for (const unsubscribe of this.unsubscribes ?? []) {
      BroadcasterDebug.log(
        `removeAllObservers() unsubscribing: ${unsubscribe}`,
      );
      await unsubscribe();
    }
    this.currentContentTopics = [];
    this.unsubscribes = [];
  };

  private static getDecodersForChain = (chain: Chain) => {
    // Get the content topics for the chain
    const contentTopicFees = contentTopics.fees(chain);
    const contentTopicTransactResponse = contentTopics.transactResponse(chain);

    // Create the decoders for the subscriptions
    const feesDecoder = createDecoder(
      contentTopicFees,
      WAKU_RAILGUN_PUB_SUB_TOPIC, // custom pubsub topic
    );
    const transactResponseDecoder = createDecoder(
      contentTopicTransactResponse,
      WAKU_RAILGUN_PUB_SUB_TOPIC, // custom pubsub topic
    );

    // Create the callbacks for the subscriptions
    const feesCallback = (message: IMessage) =>
      handleBroadcasterFeesMessage(chain, message, contentTopicFees);
    const transactResponseCallback =
      BroadcasterTransactResponse.handleBroadcasterTransactionResponseMessage;

    // Create the subscription parameters
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

  private static addChainObservers = async (waku: RelayNode, chain: Chain) => {
    if (!isDefined(waku.relay)) {
      BroadcasterDebug.log('No waku relay instance found in addChainObservers');
      return;
    }

    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );

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
    waku: Optional<RelayNode>,
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
    const unsubscribe = await waku.relay.subscribe(decoder, callback);
    this.unsubscribes.push(unsubscribe);
    this.currentContentTopics.push(transportTopic);
  }

  private static async addSubscriptions(
    chain: Optional<Chain>,
    waku: Optional<RelayNode>,
  ) {
    if (!isDefined(chain) || !isDefined(waku)) {
      BroadcasterDebug.log('addSubscriptions(): No Waku or Chain defined.');
      return;
    }

    // Get the subscription parameters for the chain
    const subscriptionParams = WakuObservers.getDecodersForChain(chain);

    // Get the topics while preventing duplicates in currentContentTopics[]
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(
      topic => !this.currentContentTopics.includes(topic),
    );
    this.currentContentTopics.push(...newTopics);

    // Subscribe to the topics with their decoders and callbacks
    for (const subParam of subscriptionParams) {
      const { decoder, callback } = subParam;

      // Get back the unsubscribe function from the relay.subscribe() call
      const unsubscribe = await waku.relay.subscribe(decoder, callback);
      this.unsubscribes.push(unsubscribe);
    }
  }

  static getCurrentContentTopics(waku?: RelayNode): string[] {
    return this.currentContentTopics;
  }
}
