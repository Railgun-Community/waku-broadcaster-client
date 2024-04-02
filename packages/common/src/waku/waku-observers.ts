import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics.js';
import { IMessage, IFilterSubscription, IDecoder, RelayNode, Unsubscribe } from '@waku/interfaces';
import { handleRelayerFeesMessage } from '../fees/handle-fees-message.js';
import { RelayerTransactResponse } from '../transact/relayer-transact-response.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';

type SubscriptionParams = {
  topic: string;
  decoder: IDecoder<any> | IDecoder<any>[];
  callback: (message: any) => void;
}

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscriptions: (Unsubscribe)[] = [];
  static setObserversForChain = async (
    waku: Optional<RelayNode>,
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
    RelayerDebug.log(`Add Waku observers for chain: ${chain.type}:${chain.id}`);
    WakuObservers.currentChain = chain;
    WakuObservers.removeAllObservers();
    await WakuObservers.addChainObservers(waku, chain);
    RelayerDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
  };

  static resetCurrentChain = () => {
    this.currentChain = undefined;
  };
  // private static isPinging = false;
  // static pingAllSubscriptions = async (waku: Optional<RelayNode>) => {
  //   if (this.isPinging) {
  //     return;
  //   }
  //   this.isPinging = true;
  //   // await this.addSubscriptions(this.currentChain, waku).catch(err => {
  //   //   RelayerDebug.error(new Error(`Error adding subscriptions. ${err.message}`),)
  //   // });
  //   if (isDefined(this.currentSubscription)) {
  //     for (const { subscription, params } of this.currentSubscription) {
  //       if (!this.isPinging) {
  //         // removeAllObservers was called. Stop pinging.
  //         break;
  //       }
  //       await subscription.ping().then(() => {
  //         RelayerDebug.log("Ping Success")
  //       }).catch(async (err: Error) => {
  //         // No response received for request
  //         // Failed to get a connection to the peer
  //         // the connection is being closed
  //         // peer has no subscriptions
  //         RelayerDebug.error(new Error(`Ping Error: ${err.message}`))
  //         if (
  //           err instanceof Error &&
  //           err.message.includes("peer has no subscriptions")
  //         ) {
  //           for (const subParam of params) {
  //             const { decoder, callback } = subParam;
  //             await subscription.subscribe(
  //               decoder,
  //               callback
  //             ).then(() => {
  //               RelayerDebug.log("Resubscribed")
  //             }).catch((err) => {
  //               RelayerDebug.error(new Error(`Error re-subscribing: ${err.message}`))
  //             })
  //           }
  //         }
  //       });
  //     }
  //   }
  //   await delay(60 * 1000);
  //   this.isPinging = false;
  //   WakuObservers.pingAllSubscriptions(waku);
  // }

  static removeAllObservers = () => {

    for (const unsubscribe of this.currentSubscriptions ?? []) {
      unsubscribe();
    }
    this.currentContentTopics = [];
    this.currentSubscriptions = [];
  };

  private static getDecodersForChain = (chain: Chain) => {
    const contentTopicFees = contentTopics.fees(chain);
    const contentTopicTransactResponse = contentTopics.transactResponse(chain);
    const feesDecoder = createDecoder(contentTopicFees, WAKU_RAILGUN_PUB_SUB_TOPIC);
    const transactResponseDecoder = createDecoder(contentTopicTransactResponse, WAKU_RAILGUN_PUB_SUB_TOPIC);
    const feesCallback = (message: IMessage) => handleRelayerFeesMessage(chain, message, contentTopicFees);
    const transactResponseCallback = RelayerTransactResponse.handleRelayerTransactionResponseMessage;

    const feesSubscriptionParams = {
      topic: contentTopicFees,
      decoder: feesDecoder,
      callback: feesCallback
    }
    const transactResponseSubscriptionParams = {
      topic: contentTopicTransactResponse,
      decoder: transactResponseDecoder,
      callback: transactResponseCallback
    }
    return [feesSubscriptionParams, transactResponseSubscriptionParams];
  }

  static subscribedPeers: string[] = [];

  private static addChainObservers = async (waku: RelayNode, chain: Chain) => {
    if (!isDefined(waku.relay)) {
      return;
    }

    await WakuObservers.addSubscriptions(chain, waku).catch(err => {
      RelayerDebug.log(`Error adding Observers. ${err.message}`)
    })

    // Log current list of observers
    const currentContentTopics = WakuObservers.getCurrentContentTopics();
    RelayerDebug.log('Waku content topics:');
    for (const observer of currentContentTopics) {
      RelayerDebug.log(observer);
    }
  };

  private static async addSubscriptions(chain: Optional<Chain>, waku: Optional<RelayNode>) {

    if (!isDefined(chain) || !isDefined(waku)) {
      RelayerDebug.log("AddSubscription: No Waku or Chain defined.")
      return;
    }

    const subscriptionParams = WakuObservers.getDecodersForChain(chain);
    const topics = subscriptionParams.map(subParam => subParam.topic);
    const newTopics = topics.filter(topic => !this.currentContentTopics.includes(topic));
    this.currentContentTopics.push(...newTopics);

    this.currentSubscriptions ??= [];
    for (const subParam of subscriptionParams) {
      const { decoder, callback } = subParam;
      const unsubscribe = await waku.relay.subscribe(
        decoder,
        callback
      );
      this.currentSubscriptions.push(unsubscribe);
    }
  }

  static getCurrentContentTopics(waku?: RelayNode): string[] {
    return this.currentContentTopics;
  }
}
