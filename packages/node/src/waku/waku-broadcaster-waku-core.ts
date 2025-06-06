import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { WakuObservers } from './waku-observers.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { tcp } from '@libp2p/tcp';
import { Protocols, type IMessage, type RelayNode } from '@waku/interfaces';
import { createEncoder } from '@waku/core';
import { createRelayNode } from '@waku/relay';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_NODE,
  WAKU_RAILGUN_DEFAULT_SHARD,
  WAKU_RAILGUN_DEFAULT_SHARDS,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants.js';

export class WakuBroadcasterWakuCore {
  static hasError = false;
  static restartCallback: () => void;

  static waku: Optional<RelayNode>;

  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;
  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;
  private static defaultShard = WAKU_RAILGUN_DEFAULT_SHARD;
  public static restartCount = 0;

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

  static setWakuRestartCallback = (callback: () => void) => {
    WakuBroadcasterWakuCore.restartCallback = callback;
  };

  static reinitWaku = async (chain: Chain) => {
    if (
      isDefined(WakuBroadcasterWakuCore.waku) &&
      WakuBroadcasterWakuCore.waku.isStarted()
    ) {
      // Reset fees, which will reset status to "Searching".
      await WakuBroadcasterWakuCore.disconnect();
    }
    BroadcasterDebug.log(
      `Reinit Waku, ${++WakuBroadcasterWakuCore.restartCount}`,
    );
    await WakuBroadcasterWakuCore.initWaku(chain);
    if (WakuBroadcasterWakuCore.restartCallback) {
      WakuBroadcasterWakuCore.restartCallback();
    }
  };

  static setBroadcasterOptions(broadcasterOptions: BroadcasterOptions) {
    if (isDefined(broadcasterOptions.pubSubTopic)) {
      WakuBroadcasterWakuCore.pubSubTopic = broadcasterOptions.pubSubTopic;
    }
    if (broadcasterOptions.additionalDirectPeers) {
      WakuBroadcasterWakuCore.additionalDirectPeers =
        broadcasterOptions.additionalDirectPeers;
    }
    if (isDefined(broadcasterOptions.peerDiscoveryTimeout)) {
      WakuBroadcasterWakuCore.peerDiscoveryTimeout =
        broadcasterOptions.peerDiscoveryTimeout;
    }
  }

  static disconnect = async () => {
    await WakuBroadcasterWakuCore.waku?.stop();
    WakuBroadcasterWakuCore.waku = undefined;
  };

  private static connect = async (): Promise<void> => {
    try {
      WakuBroadcasterWakuCore.hasError = false;

      BroadcasterDebug.log(`Creating waku broadcast client`);

      const bootstrapPeers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_NODE,
        ...this.additionalDirectPeers,
      ];
      const waku: RelayNode = await createRelayNode({
        networkConfig: WAKU_RAILGUN_DEFAULT_SHARDS,
        bootstrapPeers,
        libp2p: {
          transports: [tcp()],
        },
      });

      BroadcasterDebug.log('Start Waku.');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer.');
      await this.waitForRemotePeer(waku);

      if (!isDefined(waku.relay)) {
        throw new Error('No Waku relay instantiated.');
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
    return this.getPubSubPeerCount();
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

  private static async waitForRemotePeer(waku: RelayNode): Promise<void> {
    try {
      const protocols = [Protocols.Relay];
      await promiseTimeout(
        waku.waitForPeers(protocols),
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

  static async broadcastMessage(
    data: object,
    contentTopic: string,
  ): Promise<void> {
    const dataString = JSON.stringify(data);
    const payload = utf8ToBytes(dataString);
    const message: IMessage = { payload };
    try {
      const encoder = createEncoder({
        contentTopic,
        pubsubTopicShardInfo: this.defaultShard,
      });
      await WakuBroadcasterWakuCore.waku?.relay.send(encoder, message);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      BroadcasterDebug.error(err);
    }
  }
}
