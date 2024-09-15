import { Chain, delay, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Protocols, IMessage, RelayNode } from '@waku/interfaces';
import { WakuObservers } from './waku-observers.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { bootstrap } from '@libp2p/bootstrap';
import { tcp } from '@libp2p/tcp';
import { createRelayNode } from '@waku/sdk/relay';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_NODE,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants.js';

export class WakuBroadcasterWakuCore {
  static hasError = false;

  static waku: Optional<RelayNode>;
  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;
  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      await WakuBroadcasterWakuCore.connect();
      if (!WakuBroadcasterWakuCore.waku) {
        BroadcasterDebug.log('No waku instance found');
        return;
      }
      WakuObservers.resetCurrentChain();
      await WakuObservers.setObserversForChain(
        WakuBroadcasterWakuCore.waku,
        chain,
      );
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      BroadcasterDebug.error(err);
      throw err;
    }
  };

  static reinitWaku = async (chain: Chain, resetCache = true) => {
    if (
      isDefined(WakuBroadcasterWakuCore.waku) &&
      WakuBroadcasterWakuCore.waku.isStarted()
    ) {
      await WakuBroadcasterWakuCore.disconnect();
    }

    // Resets connection status to "Connecting" for this network.
    if (resetCache) {
      BroadcasterFeeCache.resetCache(chain);
    }

    await WakuBroadcasterWakuCore.initWaku(chain);
  };

  static setBroadcasterOptions(BroadcasterOptions: BroadcasterOptions) {
    if (isDefined(BroadcasterOptions.pubSubTopic)) {
      WakuBroadcasterWakuCore.pubSubTopic = BroadcasterOptions.pubSubTopic;
    }
    if (BroadcasterOptions.additionalDirectPeers) {
      WakuBroadcasterWakuCore.additionalDirectPeers =
        BroadcasterOptions.additionalDirectPeers;
    }
    if (isDefined(BroadcasterOptions.peerDiscoveryTimeout)) {
      WakuBroadcasterWakuCore.peerDiscoveryTimeout =
        BroadcasterOptions.peerDiscoveryTimeout;
    }
  }

  static disconnect = async (removeObservers: boolean = false) => {
    if (removeObservers) {
      BroadcasterDebug.log('Disconnecting... Removing Observers.');
      await WakuObservers.removeAllObservers();
    }
    await WakuBroadcasterWakuCore.waku?.stop();
    WakuBroadcasterWakuCore.waku = undefined;
  };

  private static connect = async (): Promise<void> => {
    try {
      WakuBroadcasterWakuCore.hasError = false;

      BroadcasterDebug.log(`Creating waku relay client`);

      const peers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_NODE,
        ...this.additionalDirectPeers,
      ];
      const waitTimeoutBeforeBootstrap = 1250; // 250 ms - default is 1000ms
      const waku: RelayNode = await createRelayNode({
        pubsubTopics: [WakuBroadcasterWakuCore.pubSubTopic],
        libp2p: {
          transports: [tcp()],
          peerDiscovery: [
            bootstrap({
              list: peers,
              timeout: waitTimeoutBeforeBootstrap,
            }),
          ],
        },
      });

      BroadcasterDebug.log('Start Waku.');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer.');
      await this.waitForRemotePeer(waku);

      if (!isDefined(waku.relay)) {
        throw new Error('No Waku Relay instantiated.');
      }

      BroadcasterDebug.log('Waku peers:');
      for (const peer of waku.libp2p.getPeers()) {
        BroadcasterDebug.log(JSON.stringify(peer));
      }

      BroadcasterDebug.log('Connected to Waku');
      WakuBroadcasterWakuCore.waku = waku;
      WakuBroadcasterWakuCore.hasError = false;
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      WakuBroadcasterWakuCore.hasError = true;
      throw err;
    }
  };

  static getMeshPeerCount(): number {
    return (
      this.waku?.relay.getMeshPeers(WAKU_RAILGUN_PUB_SUB_TOPIC).length ?? 0
    );
  }

  static getPubSubPeerCount(): number {
    const peers = this.waku?.libp2p.getPeers() ?? [];
    return peers.length;
  }

  static async getLightPushPeerCount(): Promise<number> {
    return 0;
  }

  static async getFilterPeerCount(): Promise<number> {
    return 0;
  }

  private static async waitForRemotePeer(waku: RelayNode) {
    try {
      const protocols = [Protocols.Relay];
      await promiseTimeout(
        waitForRemotePeer(waku, protocols),
        WakuBroadcasterWakuCore.peerDiscoveryTimeout,
      );
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      BroadcasterDebug.error(err);
      throw new Error(err.message);
    }
  }

  static async relayMessage(
    data: object,
    contentTopic: string,
    retry: number = 0,
  ): Promise<void> {
    try {
      const dataString = JSON.stringify(data);
      const payload = utf8ToBytes(dataString);
      const message: IMessage = { payload };
      // @ts-ignore - waku.relay may not be defined
      await WakuBroadcasterWakuCore.waku.relay.send(
        createEncoder({
          contentTopic,
          pubsubTopic: WakuBroadcasterWakuCore.pubSubTopic,
        }),
        message,
      );
    } catch (err) {
      BroadcasterDebug.error(err);
      if (!(err instanceof Error)) {
        throw err;
      }
    }
  }
}
