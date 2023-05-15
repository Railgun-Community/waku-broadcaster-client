import { Chain, compareChains } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics';
import { Waku, IMessage } from '@waku/interfaces';
import { handleRelayerFeesMessage } from '../fees/handle-fees-message';
import { RelayerTransactResponse } from '../transact/relayer-transact-response';
import { RelayerDebug } from '../utils/relayer-debug';

export class WakuObservers {
  private static currentChain: Optional<Chain>;

  static setObserversForChain = async (waku: Optional<Waku>, chain: Chain) => {
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
  };

  static resetCurrentChain = () => {
    this.currentChain = undefined;
  };

  private static removeAllObservers = (waku: Waku) => {
    if (!waku.relay) {
      return;
    }
    // @ts-ignore
    waku.relay.observers = new Map();
  };

  private static addChainObservers = async (waku: Waku, chain: Chain) => {
    if (!waku.relay) {
      return;
    }

    const contentTopicFees = contentTopics.fees(chain);
    await waku.relay.subscribe(
      createDecoder(contentTopicFees),
      (message: IMessage) =>
        handleRelayerFeesMessage(chain, message, contentTopicFees),
    );

    await waku.relay.subscribe(
      createDecoder(contentTopics.transactResponse(chain)),
      RelayerTransactResponse.handleRelayerTransactionResponseMessage,
    );

    // Log current list of observers
    const currentObservers = WakuObservers.getCurrentObservers(waku);
    RelayerDebug.log('Waku observers:');
    for (const observer of currentObservers) {
      RelayerDebug.log(observer);
    }
  };

  static getCurrentObservers(waku?: Waku): string[] {
    const activeSubscriptions = waku?.relay?.getActiveSubscriptions();
    if (!activeSubscriptions) {
      return [];
    }
    const observers: string[] = [];
    for (const observerList of activeSubscriptions.values()) {
      observers.push(...observerList);
    }
    return observers;
  }
}
