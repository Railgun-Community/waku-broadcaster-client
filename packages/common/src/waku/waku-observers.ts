import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics.js';
import {
  LightNode,
  IMessage,
  // IFilterSubscription,
  IDecoder,
  Unsubscribe,
  type SingleShardInfo,
} from '@waku/interfaces';
import { handleBroadcasterFeesMessage } from '../fees/handle-fees-message.js';
import { BroadcasterTransactResponse } from '../transact/broadcaster-transact-response.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';
import { WakuBroadcasterClient } from '../waku-broadcaster-client.js';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
};

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions:
    | { subscription: any; params: SubscriptionParams[] }[]
    | undefined;

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
    await WakuObservers.addChainObservers(waku, chain);
    BroadcasterDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    WakuObservers.currentChain = undefined;
  };

  // private static resubScribeLoop = async (
  //   subscription: IFilterSubscription,
  //   decoder: IDecoder<any> | IDecoder<any>[],
  //   callback: (message: any) => void,
  // ): Promise<void> => {
  //   BroadcasterDebug.log('Resubscribe Loop');
  //   const result = await subscription
  //     .subscribe(decoder, callback)
  //     .then(() => {
  //       BroadcasterDebug.log('Resubscribed');
  //     })
  //     .catch(err => {
  //       BroadcasterDebug.error(
  //         new Error(`Error re-subscribing: ${err.message}`),
  //       );
  //       return undefined;
  //     });

  //   return;
  // };

  private static isPinging = false;
  static pingAllSubscriptions = async (waku: Optional<LightNode>) => {
    if (WakuObservers.isPinging === true) {
      return;
    }
    console.log('PINGING SUBSCRIPTIONS');
    WakuObservers.isPinging = true;
    if (isDefined(WakuObservers.currentSubscriptions)) {
      try {
        if (WakuObservers.currentSubscriptions.length === 0) {
          BroadcasterDebug.log('No subscriptions to ping');
          throw new Error('No subscriptions to ping');
        }
        for (const {
          subscription,
          params,
        } of WakuObservers.currentSubscriptions) {
          console.log('PINGING SUBSCRIPTION');
          if (!WakuObservers.isPinging) {
            // removeAllObservers was called. Stop pinging.
            BroadcasterDebug.log('Stop pinging');
            break;
          }
          let pingSuccess = false;
          await subscription
            .ping()
            .then(() => {
              BroadcasterDebug.log('Ping Success');
              pingSuccess = true;
            })
            .catch(async (err: Error) => {
              // No response received for request
              // Failed to get a connection to the peer
              // the connection is being closed
              // peer has no subscriptions
              BroadcasterDebug.error(new Error(`Ping Error: ${err.message}`));
              throw new Error(err.message);
            })
            .finally(() => {
              if (!pingSuccess) {
                BroadcasterDebug.log(
                  "pingAllSubscriptions: Ping failed, let's reconnect",
                );
                throw new Error('Ping failed, lets reconnect');
              }
            });
        }
      } catch (error) {
        await WakuBroadcasterClient.tryReconnect();
        WakuObservers.isPinging = false;
        WakuObservers.subscribedPeers = [];
        await WakuObservers.addSubscriptions(
          WakuObservers.currentChain,
          waku,
        ).catch(err => {
          BroadcasterDebug.error(
            new Error(`Error adding subscriptions. ${err.message}`),
          );
        });
      }
    } else {
      WakuObservers.subscribedPeers = [];
      await WakuObservers.addSubscriptions(
        WakuObservers.currentChain,
        waku,
      ).catch(err => {
        BroadcasterDebug.error(
          new Error(`Error adding subscriptions. ${err.message}`),
        );
      });
    }
    await delay(15 * 1000);
    WakuObservers.isPinging = false;
    WakuObservers.pingAllSubscriptions(waku);
  };

  private static removeAllObservers = async (waku: Optional<LightNode>) => {
    if (!isDefined(waku?.lightPush)) {
      return;
    }
    if (isDefined(WakuObservers.currentSubscriptions)) {
      for (const { subscription } of WakuObservers.currentSubscriptions) {
        await subscription
          .unsubscribe(WakuObservers.currentContentTopics)
          .catch((err: Error) => {
            BroadcasterDebug.log(`Unsubscribe Error ${err.message}`);
          });
      }
      WakuObservers.currentSubscriptions = [];
      WakuObservers.currentContentTopics = [];
      WakuObservers.subscribedPeers = [];
    }
  };

  private static getDecodersForChain = (chain: Chain) => {
    const contentTopicFees = contentTopics.fees(chain);
    const contentTopicTransactResponse = contentTopics.transactResponse(chain);
    const networkConfig = { clusterId: 1, shard: 0 };

    const feesDecoder = createDecoder(contentTopicFees, networkConfig);
    const transactResponseDecoder = createDecoder(
      contentTopicTransactResponse,
      networkConfig,
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
      return;
    }

    console.log('ADDING OBSERVERS');
    await WakuObservers.addSubscriptions(chain, waku).catch(err => {
      BroadcasterDebug.log(`Error adding Observers. ${err.message}`);
    });
    if (!WakuObservers.hasStartedPinging) {
      WakuObservers.hasStartedPinging = true;
      WakuObservers.pingAllSubscriptions(waku);
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
    const shard = {
      clusterId: 1,
      shard: 0,
    };
    const decoder = createDecoder(transportTopic, shard);
    const peers = await waku.libp2p.peerStore.all();

    for (const peer of peers) {
      if (WakuObservers.subscribedPeers.includes(peer.id.toString())) {
        continue;
      }
      // @ts-ignore
      const filterSubscription = await waku.filter.createSubscription(
        shard,
        peer.id,
      );
      const params: SubscriptionParams = {
        topic: transportTopic,
        decoder,
        callback,
      };
      await filterSubscription.subscribe(decoder, callback);
      WakuObservers.currentSubscriptions?.push({
        subscription: filterSubscription,
        params: [params],
      });
      WakuObservers.subscribedPeers.push(peer.id.toString());
      BroadcasterDebug.log(`Adding peer complete ${peer.id.toString()}`);
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
    console.log('subscriptionParams', subscriptionParams);
    const topics = subscriptionParams.map(subParam => subParam.topic);
    console.log(topics);
    const newTopics = topics.filter(
      topic => !WakuObservers.currentContentTopics.includes(topic),
    );
    WakuObservers.currentContentTopics.push(...newTopics);
    const shard: SingleShardInfo = {
      clusterId: 1,
      shard: 0,
    };
    const peers = await waku.libp2p.peerStore.all();
    for (const peer of peers) {
      console.log('PEER', peer.addresses);
      if (WakuObservers.subscribedPeers.includes(peer.id.toString())) {
        console.log('CONTINUING ON');
        continue;
      }
      // @ts-ignore
      console.log('NEW TOPICS', newTopics);
      // for (const topic of newTopics) {
      //@ts-ignore
      // const filterSubscription = await waku.filter.subscribe(

      // )
      console.log('SUB PARAMS', subscriptionParams);
      for (const subParam of subscriptionParams) {
        const { decoder, callback } = subParam;
        console.log(decoder);
        console.log(callback);
        const subscription = await waku.filter.subscribe([decoder], callback);
        console.log('Subscription');
        this.currentSubscriptions ??= [];
        const newParams = {
          subscription,
          params: subscriptionParams,
        };
        WakuObservers.currentSubscriptions?.push(newParams);
      }
      // }
      if (WakuObservers.subscribedPeers.includes(peer.id.toString())) {
        WakuObservers.subscribedPeers.push(peer.id.toString());
        BroadcasterDebug.log(`Adding peer complete ${peer.id.toString()}`);
      }
    }
  }

  static getCurrentContentTopics(): string[] {
    return WakuObservers.currentContentTopics;
  }
}
