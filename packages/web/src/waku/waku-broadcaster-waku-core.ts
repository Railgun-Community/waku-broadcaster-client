import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Protocols, IMessage, LightNode } from '@waku/interfaces';
import { WakuObservers } from './waku-observers.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { bootstrap } from '@libp2p/bootstrap';
import { createLightNode } from '@waku/sdk';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
  WAKU_RAILGUN_DEFAULT_SHARD,
} from '../models/constants.js';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { wakuDnsDiscovery } from '@waku/discovery';
import type { Libp2pOptions } from 'libp2p';

export class WakuBroadcasterWakuCore {
  static hasError = false;

  static waku: Optional<LightNode>;
  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;
  private static defaultShard = WAKU_RAILGUN_DEFAULT_SHARD;

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

  static reinitWaku = async (chain: Chain) => {
    if (
      isDefined(WakuBroadcasterWakuCore.waku) &&
      WakuBroadcasterWakuCore.waku.isStarted()
    ) {
      // Reset fees, which will reset status to "Searching".
      await WakuBroadcasterWakuCore.disconnect();
    }

    BroadcasterFeeCache.resetCache(chain);
    await WakuBroadcasterWakuCore.initWaku(chain);
  };

  static setBroadcasterOptions(broadcasterOptions: BroadcasterOptions) {
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
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...this.additionalDirectPeers,
      ];
      // const enrTree = 'enrtree://[PUBLIC KEY]@[DOMAIN NAME]';

      const enrTreeFleet =
        'enrtree://16Uiu2HAm3GnUDQhBfax298CMkZX9MBHTJ9B8GXhrbueozESUaRZP@fleet.rootedinprivacy.com';
      const enrTreeCore =
        'enrtree://16Uiu2HAm4Ai1GzKv4EykU26ST1BPT4AHtABsYCLKrDG74GWX7D6H@core.rootedinprivacy.com';
      const waitTimeoutBeforeBootstrap = 250; // 250 ms - default is 1000ms

      const networkConfig = {
        clusterId: 0,
        shards: [0, 1, 2, 3, 4, 5],
      };
      const NODE_REQUIREMENTS = {
        lightPush: 1,
        filter: 1,
      };
      // Optional: Add custom libp2p configuration
      const libp2p: Libp2pOptions = {
        peerDiscovery: [
          wakuDnsDiscovery([enrTreeFleet, enrTreeCore], NODE_REQUIREMENTS),
        ],
      };

      const waku = await createLightNode({
        bootstrapPeers,
        networkConfig,
        // libp2p,
      });

      BroadcasterDebug.log('Start Waku.');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer.');
      await this.waitForRemotePeer(waku);

      if (!isDefined(waku.lightPush)) {
        throw new Error('No Waku LightPush instantiated.');
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
    return WakuBroadcasterWakuCore.getPubSubPeerCount();
  }

  static getPubSubPeerCount(): number {
    const peers = WakuBroadcasterWakuCore.waku?.libp2p.getPeers() ?? [];
    return peers.length;
  }

  static async getLightPushPeerCount(): Promise<number> {
    const peers = WakuBroadcasterWakuCore.waku?.lightPush.connectedPeers ?? [];
    return peers.length;
  }

  static async getFilterPeerCount(): Promise<number> {
    const peers =
      (await WakuBroadcasterWakuCore.waku?.filter.connectedPeers) ?? [];
    return peers.length;
  }

  private static async waitForRemotePeer(waku: LightNode) {
    try {
      const protocols = [Protocols.LightPush, Protocols.Filter];
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
      await WakuBroadcasterWakuCore.waku?.lightPush.send(encoder, message);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      BroadcasterDebug.error(err);
    }
  }
}
