import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Protocols, IMessage, LightNode } from '@waku/interfaces';
import { WakuSubscriptions } from './waku-subscriptions.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import { createLightNode } from '@waku/sdk';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_DEFAULT_SHARD,
  WAKU_RAILGUN_DEFAULT_SHARDS,
} from '../models/constants.js';

export class WakuBroadcasterWakuCore {
  static hasError = false;

  // NOTE: Subscriptions should only subscribe from this instance
  //... for example: waku.filter.subscribe, not subscription.subscribe
  // This prevents subscriptions having subscriptions themselves
  static waku: Optional<LightNode>;

  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;
  private static defaultShard = WAKU_RAILGUN_DEFAULT_SHARD;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      // Create waku instance with bootstrap peers
      await WakuBroadcasterWakuCore.connect();

      // Check if waku instance is created
      if (!WakuBroadcasterWakuCore.waku) {
        BroadcasterDebug.log('No waku instance found in initWaku()');
        return;
      }

      // TODO why is this here, why reset chain if init occurs one time
      // WakuSubscriptions.resetCurrentChain();

      // Create initial subscriptions for the chain
      await WakuSubscriptions.createSubscriptionsForChain(
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

      // Get default bootstrap peers
      const bootstrapPeers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...this.additionalDirectPeers,
      ];

      // Create the Waku instance
      const waku = await createLightNode({
        bootstrapPeers,
        networkConfig: WAKU_RAILGUN_DEFAULT_SHARDS,
      });

      BroadcasterDebug.log('Starting Waku');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer');
      await waitForRemotePeer(
        waku,
        [Protocols.LightPush, Protocols.Filter],
        WakuBroadcasterWakuCore.peerDiscoveryTimeout,
      );

      if (!isDefined(waku.lightPush)) {
        throw new Error('No Waku LightPush instantiated.');
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

  static async getLightPushPeerCount(): Promise<number> {
    const peers = WakuBroadcasterWakuCore.waku?.lightPush.connectedPeers;

    if (!isDefined(peers)) {
      BroadcasterDebug.log('No waku.lightPush connectedPeers found');
      return 0;
    }

    return peers.length;
  }

  static async getFilterPeerCount(): Promise<number> {
    const peers = WakuBroadcasterWakuCore.waku?.filter.connectedPeers;

    if (!isDefined(peers)) {
      BroadcasterDebug.log('No waku.filter connectedPeers found');
      return 0;
    }

    return peers.length;
  }

  static async broadcastMessage(
    data: object,
    contentTopic: string,
  ): Promise<void> {
    if (!WakuBroadcasterWakuCore.waku) {
      throw new Error('Waku not instantiated.');
    }

    // Create message to be sent to Waku
    const dataString = JSON.stringify(data);
    const payload = utf8ToBytes(dataString);
    const message: IMessage = { payload };

    try {
      // Create encoder to be used for sending message
      const encoder = createEncoder({
        contentTopic,
        pubsubTopicShardInfo: this.defaultShard,
      });

      // Send message to Waku
      await WakuBroadcasterWakuCore.waku.lightPush.send(encoder, message);
    } catch (err) {
      BroadcasterDebug.error(err);

      if (!(err instanceof Error)) {
        throw err;
      }
    }
  }
}
