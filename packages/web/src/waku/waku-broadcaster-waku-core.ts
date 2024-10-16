import { Chain } from '@railgun-community/shared-models';
import { WakuSubscriptions } from './waku-subscriptions.js';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../utils/conversion.js';
import { isDefined } from '../utils/is-defined.js';
import {
  createEncoder,
  createLightNode,
  IMessage,
  LightNode,
  Protocols,
  waitForRemotePeer,
} from '@waku/sdk';
import { BroadcasterOptions } from '../models/index.js';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_DEFAULT_SHARD,
  WAKU_RAILGUN_DEFAULT_SHARDS,
} from '../models/constants.js';

export class WakuBroadcasterWakuCore {
  static connectFailed = false;

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

  static getBroadcasterOptions(): BroadcasterOptions {
    return {
      additionalDirectPeers: WakuBroadcasterWakuCore.additionalDirectPeers,
      peerDiscoveryTimeout: WakuBroadcasterWakuCore.peerDiscoveryTimeout,
    };
  }

  static disconnect = async () => {
    // Stop the instance if already exists
    await WakuBroadcasterWakuCore.waku?.stop();

    // Ensure instance is cleared
    WakuBroadcasterWakuCore.waku = undefined;
  };

  private static connect = async (): Promise<void> => {
    try {
      BroadcasterDebug.log(`Creating waku broadcast client`);

      // Get default bootstrap peers
      const bootstrapPeers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...WakuBroadcasterWakuCore.additionalDirectPeers,
      ];

      // Create the Waku instance
      const waku = await createLightNode({
        bootstrapPeers,
        networkConfig: WAKU_RAILGUN_DEFAULT_SHARDS,
      });

      BroadcasterDebug.log('Starting Waku');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer');
      // This should throw if no peers are found
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

      // Ensure connectFailed is false in case this has been called as a re-init attempt
      WakuBroadcasterWakuCore.connectFailed = false;
    } catch (err) {
      BroadcasterDebug.log(`connect() failed: ${err}`);
      // If connecting failed, ensure disconnection
      await WakuBroadcasterWakuCore.disconnect();
      WakuBroadcasterWakuCore.connectFailed = true;

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
        pubsubTopicShardInfo: WakuBroadcasterWakuCore.defaultShard,
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
