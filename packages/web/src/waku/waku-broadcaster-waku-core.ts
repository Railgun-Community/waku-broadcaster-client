import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { WakuObservers } from './waku-observers.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { BroadcasterFeeCache } from '../fees/broadcaster-fee-cache.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { BroadcasterOptions } from '../models/index.js';

import { createRelayNode } from '@waku/sdk/relay';
import {
  RelayNode,
  Protocols,
  waitForRemotePeer,
  IMessage,
  createEncoder,
} from '@waku/sdk';

import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants.js';

export class WakuBroadcasterWakuCore {
  static hasError = false;

  static waku: Optional<RelayNode>;
  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;
  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;

  static initWaku = async (chain: Chain): Promise<void> => {
    BroadcasterDebug.log('Initializing Waku client...');

    try {
      await WakuBroadcasterWakuCore.connect();

      if (!WakuBroadcasterWakuCore.waku) {
        BroadcasterDebug.log('No waku instance found');
        return;
      }

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
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...this.additionalDirectPeers,
      ];
      const waitTimeoutBeforeBootstrap = 1250; // 250 ms - default is 1000ms

      console.log('starting relay node');
      const waku: RelayNode = await createRelayNode({
        pubsubTopics: [WakuBroadcasterWakuCore.pubSubTopic],
        bootstrapPeers: peers,
        relayKeepAlive: 3, // 10 seconds, default is 5 minutes
        pingKeepAlive: 3, // 10 seconds, default is 5 minutes
        numPeersToUse: 5, // default is 3
        // allowedTopics: get /railgun/ topics here maybe? prob diff thing
      });
      console.log('relay node created');

      // Store the waku instance
      WakuBroadcasterWakuCore.waku = waku;

      BroadcasterDebug.log('Start Waku.');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer.');
      await this.waitForRemotePeer();

      if (!isDefined(waku.relay)) {
        throw new Error('No Waku Relay instantiated.');
      }

      BroadcasterDebug.log('Waku peers:');
      for (const peer of waku.libp2p.getPeers()) {
        BroadcasterDebug.log(JSON.stringify(peer));
      }
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
    const peers = this.waku?.relay.getMeshPeers(WAKU_RAILGUN_PUB_SUB_TOPIC);

    if (!peers) {
      BroadcasterDebug.log(
        'getMeshPeers returns undefined in getMeshPeerCount',
      );
      return 0;
    }
    return peers.length;
  }

  static getPubSubPeerCount(): number {
    const peers = this.waku?.libp2p.getPeers();

    if (!peers) {
      BroadcasterDebug.log('getPeers returns undefined in getPubSubPeerCount');
      return 0;
    }

    BroadcasterDebug.log(`PubSub Peer Count: ${peers.length}`);

    return peers.length;
  }

  static async getLightPushPeerCount(): Promise<number> {
    BroadcasterDebug.log('Light Push Peer Count not implemented');
    return 0;
  }

  static async getFilterPeerCount(): Promise<number> {
    BroadcasterDebug.log('Filter Peer Count not implemented');
    return 0;
  }

  static async waitForRemotePeer() {
    if (!WakuBroadcasterWakuCore.waku) {
      throw new Error('No Waku instance found.');
    }

    BroadcasterDebug.log('Waiting for remote peer...');

    try {
      const protocols = [Protocols.Relay];
      await promiseTimeout(
        waitForRemotePeer(WakuBroadcasterWakuCore.waku, protocols),
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
