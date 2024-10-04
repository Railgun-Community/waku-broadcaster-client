import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics.js';
import {
  LightNode,
  IMessage,
  IFilterSubscription,
  IDecoder,
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
  private static currentSubscriptions:
    | { subscription: IFilterSubscription; params: SubscriptionParams[] }[]
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

  private static resubScribeLoop = async (
    subscription: IFilterSubscription,
    decoder: IDecoder<any> | IDecoder<any>[],
    callback: (message: any) => void,
  ): Promise<void> => {
    BroadcasterDebug.log('Resubscribe Loop');
    const result = await subscription
      .subscribe(decoder, callback)
      .then(() => {
        BroadcasterDebug.log('Resubscribed');
      })
      .catch(err => {
        BroadcasterDebug.error(
          new Error(`Error re-subscribing: ${err.message}`),
        );
        return undefined;
      });

    // if (isDefined(result)) {
    //   return result;
    // }
    return;
    // await delay(1000);
    // return WakuObservers.resubScribeLoop(subscription, decoder, callback);
  };
  private static isPinging = false;
  static pingAllSubscriptions = async (waku: Optional<LightNode>) => {
    if (WakuObservers.isPinging === true) {
      BroadcasterDebug.log('PingING-not-working');
      return;
    }
    BroadcasterDebug.log('PingING-working');

    WakuObservers.isPinging = true;
    // await WakuObservers.removeAllObservers(waku);
    // await WakuObservers.addSubscriptions(
    //   WakuObservers.currentChain,
    //   waku,
    // ).catch(err => {
    //   BroadcasterDebug.error(
    //     new Error(`Error adding subscriptions. ${err.message}`),
    //   );
    // });
    if (isDefined(WakuObservers.currentSubscriptions)) {
      try {
        for (const {
          subscription,
          params,
        } of WakuObservers.currentSubscriptions) {
          if (!WakuObservers.isPinging) {
            // removeAllObservers was called. Stop pinging.
            BroadcasterDebug.log('Stop pinging');
            break;
          }
          // BroadcasterDebug.log(`Pinging ${JSON.stringify(subscription)}`);
          await subscription
            .ping()
            .then(() => {
              BroadcasterDebug.log('Ping Success');
            })
            .catch(async (err: Error) => {
              // No response received for request
              // Failed to get a connection to the peer
              // the connection is being closed
              // peer has no subscriptions
              BroadcasterDebug.error(new Error(`Ping Error: ${err.message}`));
              console.log('WE THROWING ERRR');
              // if (
              //   err instanceof Error &&
              //   err.message.includes('peer has no subscriptions')
              //  ||
              // err.message.includes(
              //   'Failed to get a connection to the peer',
              // ) ||
              // err.message.includes('the connection is being closed') ||
              // err.message.includes('No response received for request')
              // ) {
              //   console.log('THROWINGG');
              throw new Error(err.message);
              //
              for (const subParam of params) {
                const { decoder, callback } = subParam;
                BroadcasterDebug.log(`Resubscribing to ${subParam.topic}`);
                await WakuObservers.resubScribeLoop(
                  subscription,
                  decoder,
                  callback,
                );
              }
            });
        }
      } catch (error) {
        console.log('Error in pingAllSubscriptions', error);
        console.log('WE HERE');
        // await WakuObservers.removeAllObservers(waku);
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
    }
    await delay(5 * 1000);
    WakuObservers.isPinging = false;
    WakuObservers.pingAllSubscriptions(waku);
  };

  private static removeAllObservers = async (waku: Optional<LightNode>) => {
    if (!isDefined(waku?.lightPush)) {
      return;
    }
    // WakuObservers.isPinging = false;
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
      return;
    }

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
    const decoder = createDecoder(transportTopic, WAKU_RAILGUN_PUB_SUB_TOPIC);
    const peers = await waku.filter.allPeers();

    for (const peer of peers) {
      if (WakuObservers.subscribedPeers.includes(peer.id.toString())) {
        continue;
      }
      const filterSubscription = await waku.filter.createSubscription(
        WAKU_RAILGUN_PUB_SUB_TOPIC,
        peer.id,
      );
      // for (const subParam of subscriptionParams) {
      // const { decoder, callback } = subParam;
      const params: SubscriptionParams = {
        topic: transportTopic,
        decoder,
        callback,
      };
      await filterSubscription.subscribe(decoder, callback);
      // }
      // this.currentSubscriptions ??= [];
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
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(
      topic => !WakuObservers.currentContentTopics.includes(topic),
    );
    WakuObservers.currentContentTopics.push(...newTopics);
    // const peers1 = await waku.libp2p.services.pubsub?.getPeers();
    // const peers = await waku.filter.connectedPeers();
    const weird = await waku.libp2p.peerStore.all();
    console.log('WEIRD, all', weird);
    // console.log('peers1', peers1);

    for (const peer of weird) {
      if (WakuObservers.subscribedPeers.includes(peer.id.toString())) {
        continue;
      }
      const filterSubscription = await waku.filter.createSubscription(
        WAKU_RAILGUN_PUB_SUB_TOPIC,
        peer.id,
      );
      for (const subParam of subscriptionParams) {
        const { decoder, callback } = subParam;
        await filterSubscription.subscribe(decoder, callback);
      }
      this.currentSubscriptions ??= [];
      const newParams = {
        subscription: filterSubscription,
        params: subscriptionParams,
      };
      WakuObservers.currentSubscriptions?.push(newParams);
      WakuObservers.subscribedPeers.push(peer.id.toString());
      BroadcasterDebug.log(`Adding peer complete ${peer.id.toString()}`);
      // BroadcasterDebug.log(`PARAMS ${JSON.stringify(newParams)}`);
    }
  }

  static getCurrentContentTopics(): string[] {
    return WakuObservers.currentContentTopics;
  }
}
