import { Chain, isDefined } from '@railgun-community/shared-models';
import {
  LightNode,
  createLightNode,
  Protocols,
  IMessage,
  createEncoder,
} from '@waku/sdk';
import {
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_DEFAULT_SHARDS,
  WAKU_RAILGUN_DEFAULT_SHARD,
} from '../../../models/constants.js';
import { BroadcasterOptions } from '../../../models/export-models.js';
import { BroadcasterDebug } from '../../../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../../../utils/conversion.js';
import { WakuLightSubscriptions } from './waku-light-subscriptions.js';

export class WakuLightNodeCore {
  static connectFailed = false;

  // NOTE: Subscriptions should only subscribe from this instance
  //... for example: waku.filter.subscribe, not subscription.subscribe
  // This prevents subscriptions having subscriptions themselves
  static waku: Optional<LightNode>;

  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      // Create waku instance with bootstrap peers
      await WakuLightNodeCore.connect();

      // Check if waku instance is created
      if (!WakuLightNodeCore.waku) {
        BroadcasterDebug.log('No waku instance found in initWaku()');
        return;
      }

      // Create initial subscriptions for the chain
      await WakuLightSubscriptions.createSubscriptionsForChain(
        WakuLightNodeCore.waku,
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
      WakuLightNodeCore.additionalDirectPeers =
        broadcasterOptions.additionalDirectPeers;
    }
    if (isDefined(broadcasterOptions.peerDiscoveryTimeout)) {
      WakuLightNodeCore.peerDiscoveryTimeout =
        broadcasterOptions.peerDiscoveryTimeout;
    }
  }

  static getBroadcasterOptions(): BroadcasterOptions {
    return {
      additionalDirectPeers: WakuLightNodeCore.additionalDirectPeers,
      peerDiscoveryTimeout: WakuLightNodeCore.peerDiscoveryTimeout,
    };
  }

  static disconnect = async () => {
    // Stop the instance if already exists
    await WakuLightNodeCore.waku?.stop();

    // Ensure instance is cleared
    WakuLightNodeCore.waku = undefined;
  };

  private static connect = async (): Promise<void> => {
    try {
      BroadcasterDebug.log(`Creating waku broadcast client`);

      // Get default bootstrap peers
      const bootstrapPeers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...WakuLightNodeCore.additionalDirectPeers,
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
      await waku.waitForPeers(
        [Protocols.LightPush, Protocols.Filter],
        WakuLightNodeCore.peerDiscoveryTimeout,
      );

      if (!isDefined(waku.lightPush)) {
        throw new Error('No Waku LightPush instantiated.');
      }

      BroadcasterDebug.log('Connected to Waku');
      WakuLightNodeCore.waku = waku;

      // Ensure connectFailed is false in case this has been called as a re-init attempt
      WakuLightNodeCore.connectFailed = false;
    } catch (err) {
      BroadcasterDebug.log(`connect() failed: ${err}`);
      // If connecting failed, ensure disconnection
      await WakuLightNodeCore.disconnect();
      WakuLightNodeCore.connectFailed = true;

      throw err;
    }
  };

  static async getLightPushPeerCount(): Promise<number> {
    const peers =
      await WakuLightNodeCore.waku?.lightPush.protocol.connectedPeers();

    if (!isDefined(peers)) {
      BroadcasterDebug.log('No waku.lightPush connectedPeers found');
      return 0;
    }

    return peers.length;
  }

  static async getFilterPeerCount(): Promise<number> {
    const peers = WakuLightNodeCore.waku?.filter.connectedPeers;

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
    if (!WakuLightNodeCore.waku) {
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
        pubsubTopicShardInfo: WAKU_RAILGUN_DEFAULT_SHARD,
      });

      // Send message to Waku
      await WakuLightNodeCore.waku.lightPush.send(encoder, message);
    } catch (err) {
      BroadcasterDebug.error(err);

      if (!(err instanceof Error)) {
        throw err;
      }
    }
  }
}
