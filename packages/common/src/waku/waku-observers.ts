import { Chain, compareChains, delay } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics.js';
import { LightNode, IMessage, IFilterSubscription } from '@waku/interfaces';
import { handleRelayerFeesMessage } from '../fees/handle-fees-message.js';
import { RelayerTransactResponse } from '../transact/relayer-transact-response.js';
import { RelayerDebug } from '../utils/relayer-debug.js';
import { isDefined } from '../utils/is-defined.js';
import { WAKU_RAILGUN_PUB_SUB_TOPIC } from '../models/constants.js';

export class WakuObservers {
  private static currentChain: Optional<Chain>;
  private static currentContentTopics: string[] = [];
  private static currentSubscription: IFilterSubscription[] | undefined;
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
    RelayerDebug.log(`Add Waku observers for chain: ${chain.type}:${chain.id}`);
    WakuObservers.currentChain = chain;
    WakuObservers.removeAllObservers(waku);
    await WakuObservers.addChainObservers(waku, chain);
    RelayerDebug.log(
      `Waku listening for events on chain: ${chain.type}:${chain.id}`,
    );
    WakuObservers.pingAllSubscriptions(waku);
  };

  static resetCurrentChain = () => {
    this.currentChain = undefined;
  };
  private static isPinging = false;
  private static pingAllSubscriptions = async (waku: LightNode) => {
    if (this.isPinging) {
      return;
    }
    if (!isDefined(waku.filter)) {
      return;
    }
    this.isPinging = true;
    if (isDefined(this.currentSubscription)) {
      for (const subscription of this.currentSubscription) {
        await subscription.ping();
      }
    }
    await delay(10000);
    this.isPinging = false;
    await WakuObservers.pingAllSubscriptions(waku);
  }

  private static removeAllObservers = (waku: LightNode) => {
    if (!isDefined(waku.filter)) {
      return;
    }

    if (isDefined(this.currentSubscription)) {
      for (const subscription of this.currentSubscription) {
        subscription.unsubscribeAll();
      }
      this.currentSubscription = undefined;
      this.currentContentTopics = [];
    }
  };

  private static addChainObservers = async (waku: LightNode, chain: Chain) => {
    if (!isDefined(waku.filter)) {
      return;
    }

    const contentTopicFees = contentTopics.fees(chain);
    const peers = waku.libp2p.getPeers();
    this.currentContentTopics.push(contentTopicFees);
    this.currentContentTopics.push(contentTopics.transactResponse(chain));

    peers.forEach(async (peerId) => {
      const filterSubscription = await waku.filter.createSubscription(WAKU_RAILGUN_PUB_SUB_TOPIC, peerId);

      await filterSubscription.subscribe(
        createDecoder(contentTopicFees, WAKU_RAILGUN_PUB_SUB_TOPIC) as any,
        (message: IMessage) =>
          handleRelayerFeesMessage(chain, message, contentTopicFees),
      );

      await filterSubscription.subscribe(
        createDecoder(contentTopics.transactResponse(chain), WAKU_RAILGUN_PUB_SUB_TOPIC) as any,
        RelayerTransactResponse.handleRelayerTransactionResponseMessage,
      );
      this.currentSubscription ??= []
      this.currentSubscription.push(filterSubscription);
    })


    // Log current list of observers
    const currentContentTopics = WakuObservers.getCurrentContentTopics();
    RelayerDebug.log('Waku content topics:');
    for (const observer of currentContentTopics) {
      RelayerDebug.log(observer);
    }
  };

  static getCurrentContentTopics(): string[] {

    return this.currentContentTopics;
  }
}
