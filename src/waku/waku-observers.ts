import { Chain, compareChains } from '@railgun-community/shared-models';
import { createDecoder } from '@waku/core';
import { contentTopics } from './waku-topics';
import { Waku, IMessage } from '@waku/interfaces';
import { handleRelayerFeesMessage } from '../fees/handle-fees-message';
import { RelayerTransactResponse } from '../transact/relayer-transact-response';
import { RelayerDebug } from '../utils/relayer-debug';

export class WakuObservers {
  private static currentChain: Optional<Chain>;

  static setObserversForChain = (waku: Optional<Waku>, chain: Chain) => {
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
    WakuObservers.addChainObservers(waku, chain);
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

  private static addChainObservers = (waku: Waku, chain: Chain) => {
    if (!waku.relay) {
      return;
    }

    const contentTopicFees = contentTopics.fees(chain);
    waku.relay.subscribe(createDecoder(contentTopicFees), (message: IMessage) =>
      handleRelayerFeesMessage(chain, message, contentTopicFees),
    );

    waku.relay.subscribe(
      createDecoder(contentTopics.transactResponse(chain)),
      RelayerTransactResponse.handleRelayerTransactionResponseMessage,
    );

    const activeSubscriptions = waku.relay.getActiveSubscriptions();
    if (activeSubscriptions) {
      RelayerDebug.log('Waku observers:');
      for (const observerList of activeSubscriptions.values()) {
        for (const observer of observerList) {
          RelayerDebug.log(observer);
        }
      }
    }
  };
}
