import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import {
  createDecoder,
  LightNode,
  IMessage,
  IDecoder,
  type ProtocolUseOptions,
  type SubscribeOptions,
  type Unsubscribe,
  type SubscribeResult,
  Protocols,
  wakuFilter,
} from '@waku/sdk';
import { contentTopics } from './waku-topics.js';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import {
  WAKU_RAILGUN_DEFAULT_SHARD,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants.js';
import { unsubscribe } from 'diagnostics_channel';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
};

type ActiveSubscription = {
  unsubscribe: SubscribeResult | Unsubscribe;
  params: SubscriptionParams;
};

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions: ActiveSubscription[] | undefined = [];

  static setObserversForChain = async (
    waku: Optional<LightNode>,
    chain: Chain,
  ) => {
    if (!waku) {
      return;
    }
    if (
      WakuObservers.currentChain &&
      compareChains(WakuObservers.currentChain, chain)
    ) {
      return;
    }
    BroadcasterDebug.log(
      `Add Waku observers for chain: ${chain.type}:${chain.id}`,
    );
    WakuObservers.currentChain = chain;
    await WakuObservers.removeAllObservers(waku);

    BroadcasterDebug.log('Removed all observers');
    console.log('STARTING ADD CHAIN OBSERVERS');
    await WakuObservers.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    WakuObservers.currentChain = undefined;
  };

  static checkSubscriptionsHealth = async (waku: Optional<LightNode>) => {
    BroadcasterDebug.log(
      // @ts-ignore
      `WAKU Health Status: ${waku?.health.getHealthStatus()}`,
    );
    if (isDefined(this.currentSubscriptions)) {
      if (this.currentSubscriptions.length === 0) {
        BroadcasterDebug.log('No subscriptions to ping');
        // throw new Error('No subscriptions to ping');
      }
    }
    await delay(15 * 1000);
    WakuObservers.checkSubscriptionsHealth(waku);
  };

  private static removeAllObservers = async (waku: Optional<LightNode>) => {
    if (!isDefined(waku?.lightPush)) {
      return;
    }
    if (isDefined(this.currentSubscriptions)) {
      console.log('REMOVING ALL OBSERVERS', this.currentSubscriptions);
      for (const { unsubscribe, params } of this.currentSubscriptions) {
        // await unsubscribe.subscription?.unsubscribe([params.topic]);
        if (unsubscribe instanceof Function) {
          await unsubscribe();
        } else {
          await unsubscribe.subscription?.unsubscribe([params.topic]);
        }
      }
      this.currentSubscriptions = [];
      this.currentContentTopics = [];
    }
  };

  private static getDecodersForChain = (chain: Chain) => {
    const contentTopicFees = contentTopics.fees(chain);
    const contentTopicTransactResponse = contentTopics.transactResponse(chain);
    const feesDecoder = createDecoder(
      contentTopicFees,
      WAKU_RAILGUN_DEFAULT_SHARD,
    );
    const transactResponseDecoder = createDecoder(
      contentTopicTransactResponse,
      WAKU_RAILGUN_DEFAULT_SHARD,
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
    if (!isDefined(waku.filter)) {
      return;
    }

    const subscriptionResult = await WakuObservers.addSubscriptions(
      chain,
      waku,
    ).catch(err => {
      BroadcasterDebug.log(`Error adding Observers. ${err.message}`);
      return undefined;
    });
    // if (!isDefined(subscriptionResult)) {
    //   WakuObservers.addChainObservers(waku, chain);
    //   return;
    // }
    if (!WakuObservers.hasStartedPinging) {
      WakuObservers.hasStartedPinging = true;
      WakuObservers.checkSubscriptionsHealth(waku);
    }
    // Log current list of observers
    const currentContentTopics = WakuObservers.getCurrentContentTopics();
    BroadcasterDebug.log('Waku content topics:');
    for (const observer of currentContentTopics) {
      BroadcasterDebug.log(observer);
    }
  };
  static hasStartedPinging: boolean;

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
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_DEFAULT_SHARD);
    const params: SubscriptionParams = {
      topic: transportTopic,
      decoder,
      callback,
    };
    const unsubscribe = await waku.filter.subscribe(
      decoder,
      callback,
      {},
      {
        keepAlive: 30_000,
      },
    );
    WakuObservers.currentSubscriptions?.push({
      unsubscribe,
      params,
    });
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
    console.log('ADDING SUBSCRIBERS FOR ', chain);
    const subscriptionParams = WakuObservers.getDecodersForChain(chain);
    const topics = subscriptionParams.map(params => params.topic);
    const newTopics = topics.filter(
      topic => !WakuObservers.currentContentTopics.includes(topic),
    );
    this.currentContentTopics.push(...newTopics);
    for (const params of subscriptionParams) {
      const { decoder, callback } = params;
      const unsubscribe = await waku.filter
        .subscribe(
          decoder,
          callback,
          {},
          {
            keepAlive: 30_000,
          },
        )
        .catch(err => {
          console.log('Error subscribing', err);
          return undefined;
        });
      if (isDefined(unsubscribe?.error)) {
        await delay(1000);
        this.addSubscriptions(chain, waku);
        return;
      }
      if (!unsubscribe) {
        return;
      }
      WakuObservers.currentSubscriptions?.push({
        unsubscribe,
        params,
      });
    }
  }

  static getCurrentContentTopics(): string[] {
    return WakuObservers.currentContentTopics;
  }
}
