import { Chain, isDefined } from '@railgun-community/shared-models';
import { RelayNode, Protocols, IMessage, createEncoder } from '@waku/sdk';
import { createRelayNode } from '@waku/relay';
import {
  WAKU_RAILGUN_PUB_SUB_TOPIC,
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
  WAKU_RAILGUN_DEFAULT_SHARDS,
} from '../../../models/constants.js';
import { BroadcasterOptions } from '../../../models/export-models.js';
import { BroadcasterDebug } from '../../../utils/broadcaster-debug.js';
import { utf8ToBytes } from '../../../utils/conversion.js';
import { WakuRelaySubscriptions } from './waku-relay-subscriptions.js';

export class WakuRelayNodeCore {
  static connectFailed = false;
  static waku: Optional<RelayNode>;

  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;
  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      await WakuRelayNodeCore.connect(chain);

      if (!WakuRelayNodeCore.waku) {
        BroadcasterDebug.log('No waku instance found');
        return;
      }

      await WakuRelaySubscriptions.createSubscriptionsForChain(
        WakuRelayNodeCore.waku,
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
      WakuRelayNodeCore.additionalDirectPeers =
        broadcasterOptions.additionalDirectPeers;
    }
    if (isDefined(broadcasterOptions.peerDiscoveryTimeout)) {
      WakuRelayNodeCore.peerDiscoveryTimeout =
        broadcasterOptions.peerDiscoveryTimeout;
    }
    if (isDefined(broadcasterOptions.pubSubTopic)) {
      WakuRelayNodeCore.pubSubTopic = broadcasterOptions.pubSubTopic;
    }
  }

  static getBroadcasterOptions(): BroadcasterOptions {
    return {
      additionalDirectPeers: WakuRelayNodeCore.additionalDirectPeers,
      peerDiscoveryTimeout: WakuRelayNodeCore.peerDiscoveryTimeout,
      pubSubTopic: WakuRelayNodeCore.pubSubTopic,
    };
  }

  static disconnect = async () => {
    await WakuRelayNodeCore.waku?.stop();
    WakuRelayNodeCore.waku = undefined;
  };

  private static connect = async (chain: Chain): Promise<void> => {
    try {
      BroadcasterDebug.log(`Creating waku relay client`);

      const bootstrapPeers = [
        ...WAKU_RAILGUN_DEFAULT_PEERS_WEB,
        ...this.additionalDirectPeers,
      ];

      const waku = await createRelayNode({
        bootstrapPeers,
        networkConfig: WAKU_RAILGUN_DEFAULT_SHARDS,
      });

      BroadcasterDebug.log('Starting Waku');
      await waku.start();

      BroadcasterDebug.log('Waiting for remote peer');
      // This should throw if no peers are found
      await waku.waitForPeers(
        [Protocols.Relay],
        WakuRelayNodeCore.peerDiscoveryTimeout,
      );

      if (!waku.relay) {
        throw new Error('No Waku Relay instantiated.');
      }

      WakuRelayNodeCore.waku = waku;
      WakuRelayNodeCore.connectFailed = false;
    } catch (err) {
      BroadcasterDebug.log(`connect() failed: ${err}`);
      await WakuRelayNodeCore.disconnect();
      WakuRelayNodeCore.connectFailed = true;
      throw err;
    }
  };

  static async getLightPushPeerCount(): Promise<number> {
    BroadcasterDebug.log(
      'Light Push Peer Count not implemented for relay node',
    );
    return 0;
  }

  static async getFilterPeerCount(): Promise<number> {
    BroadcasterDebug.log('Filter Peer Count not implemented for relay node');
    return 0;
  }

  static getMeshPeerCount(): number {
    const peers = WakuRelayNodeCore.waku?.relay.getMeshPeers(
      WakuRelayNodeCore.pubSubTopic,
    );
    return peers?.length ?? 0;
  }

  static getPubSubPeerCount(): number {
    const peers = WakuRelayNodeCore.waku?.libp2p.getPeers();
    return peers?.length ?? 0;
  }

  static async broadcastMessage(
    data: object,
    contentTopic: string,
  ): Promise<void> {
    if (!WakuRelayNodeCore.waku?.relay) {
      throw new Error('Waku Relay not instantiated.');
    }

    try {
      const dataString = JSON.stringify(data);
      const payload = utf8ToBytes(dataString);
      const message: IMessage = { payload };

      const encoder = createEncoder({
        contentTopic,
        pubsubTopic: WakuRelayNodeCore.pubSubTopic,
      });

      await WakuRelayNodeCore.waku.relay.send(encoder, message);
    } catch (err) {
      BroadcasterDebug.error(err);
      if (!(err instanceof Error)) {
        throw err;
      }
    }
  }
}
