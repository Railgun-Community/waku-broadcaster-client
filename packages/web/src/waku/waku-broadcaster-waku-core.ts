import { Chain, delay, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Protocols, IMessage, RelayNode, LightNode } from '@waku/interfaces';
import { WakuObservers } from './waku-observers.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants.js';
import { createLightNode } from '@waku/sdk';

export class WakuBroadcasterWakuCore {
  static hasError = false;
  static peerDiscoveryTimeout = 60000;

  // static waku: Optional<RelayNode>;
  static waku: Optional<LightNode>;
  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;
  private static additionalDirectPeers: string[] = [];

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

      BroadcasterDebug.log('Finished setting observers for chain');
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
    BroadcasterDebug.log('Connecting to Waku...');

    try {
      WakuBroadcasterWakuCore.hasError = false;

      BroadcasterDebug.log(`Creating waku light client`);

      const peers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...this.additionalDirectPeers,
      ];

      // Create the light node
      const waku: LightNode = await createLightNode({
        pubsubTopics: [WakuBroadcasterWakuCore.pubSubTopic],
        bootstrapPeers: peers,
        // pingKeepAlive: 6, // ping every 6 seconds
      });

      BroadcasterDebug.log('Start Waku.');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer...');
      try {
        await waitForRemotePeer(
          waku,
          [Protocols.Filter, Protocols.LightPush],
          WakuBroadcasterWakuCore.peerDiscoveryTimeout,
        );
      } catch (err) {
        BroadcasterDebug.log(`Error waiting for remote peer: ${err.message}`);

        // Poller should see the status is hasError and callback the errored status
        WakuBroadcasterWakuCore.hasError = true;
      }

      if (!isDefined(waku.filter)) {
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

  static getFilterPeerCount(): number {
    const peers = this.waku?.filter.connectedPeers;

    if (!isDefined(peers)) {
      BroadcasterDebug.log('peers are undefined in getFilterPeerCount()');
      return 0;
    }

    return peers.length;
  }

  static getMeshPeerCount(): number {
    // return (
    //   this.waku?.relay.getMeshPeers(WAKU_RAILGUN_PUB_SUB_TOPIC).length ?? 0
    // );

    BroadcasterDebug.log('getMeshPeerCount() is not implemented');
    return 0;
  }

  static getPubSubPeerCount(): number {
    const peers = this.waku?.libp2p.getPeers();

    if (!isDefined(peers)) {
      BroadcasterDebug.log('peers are undefined in getPubSubPeerCount()');
      return 0;
    }
    return peers.length;
  }

  static getLightPushPeerCount(): number {
    const length = this.waku?.lightPush.connectedPeers.length;

    if (!isDefined(length)) {
      BroadcasterDebug.log('peers are undefined in getLightPushPeerCount()');
      return 0;
    } else if (!isDefined(this.waku)) {
      BroadcasterDebug.log(
        'waku object is undefined in getLightPushPeerCount()',
      );
      return 0;
    }

    return this.waku?.lightPush.connectedPeers.length;
  }

  static getFilterPeerCount(): number {
    BroadcasterDebug.log('getFilterPeerCount() is not implemented');
    return 0;
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

      if (!WakuBroadcasterWakuCore.waku) {
        throw new Error('Waku not instantiated.');
      }

      await WakuBroadcasterWakuCore.waku?.lightPush.send(
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
