import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Protocols, IMessage, RelayNode } from '@waku/interfaces';
import { WakuObservers } from './waku-observers';
import { RelayerDebug } from '../utils/relayer-debug';
import { RelayerFeeCache } from '../fees/relayer-fee-cache';
import { utf8ToBytes } from '../utils/conversion';
import { bootstrap } from '@libp2p/bootstrap';
import { createRelayNode } from '@waku/create';
import { RelayerOptions } from '../models';
import {
  WAKU_RAILGUN_DEFAULT_PEERS,
  WAKU_RAILGUN_PUB_SUB_TOPIC,
} from '../models/constants';

export class WakuRelayerWakuCore {
  static hasError = false;

  static waku: Optional<RelayNode>;

  private static pubSubTopic = WAKU_RAILGUN_PUB_SUB_TOPIC;
  private static additionalDirectPeers: string[] = [];
  private static peerDiscoveryTimeout = 60000;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      await WakuRelayerWakuCore.connect();
      if (!WakuRelayerWakuCore.waku) {
        RelayerDebug.log('No waku instance found');
        return;
      }
      WakuObservers.resetCurrentChain();
      await WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
      throw err;
    }
  };

  static reinitWaku = async (chain: Chain) => {
    if (WakuRelayerWakuCore.waku?.isStarted()) {
      await WakuRelayerWakuCore.disconnect();
    }

    // Resets connection status to "Connecting" for this network.
    RelayerFeeCache.resetCache(chain);

    await WakuRelayerWakuCore.initWaku(chain);
  };

  static setRelayerOptions(relayerOptions: RelayerOptions) {
    if (relayerOptions.pubSubTopic) {
      WakuRelayerWakuCore.pubSubTopic = relayerOptions.pubSubTopic;
    }
    if (relayerOptions.additionalDirectPeers) {
      WakuRelayerWakuCore.additionalDirectPeers =
        relayerOptions.additionalDirectPeers;
    }
    if (relayerOptions.peerDiscoveryTimeout) {
      WakuRelayerWakuCore.peerDiscoveryTimeout =
        relayerOptions.peerDiscoveryTimeout;
    }
  }

  static disconnect = async () => {
    await WakuRelayerWakuCore.waku?.stop();
    WakuRelayerWakuCore.waku = undefined;
  };

  private static connect = async (): Promise<void> => {
    try {
      WakuRelayerWakuCore.hasError = false;

      RelayerDebug.log(`Creating waku relay client`);

      const peers: string[] = [
        ...WAKU_RAILGUN_DEFAULT_PEERS,
        ...this.additionalDirectPeers,
      ];
      const waitTimeoutBeforeBootstrap = 250; // 250 ms - default is 1000ms
      const waku: RelayNode = await createRelayNode({
        pubSubTopic: WakuRelayerWakuCore.pubSubTopic,
        libp2p: {
          peerDiscovery: [
            bootstrap({
              list: peers,
              timeout: waitTimeoutBeforeBootstrap,
            }),
          ],
        },
      });

      RelayerDebug.log('Start Waku.');
      await waku.start();

      RelayerDebug.log('Waiting for remote peer.');
      await this.waitForRemotePeer(waku);

      if (!waku.relay) {
        throw new Error('No Waku Relay instantiated.');
      }

      RelayerDebug.log('Waku peers:');
      for (const peer of waku.relay.getMeshPeers()) {
        RelayerDebug.log(JSON.stringify(peer));
      }

      RelayerDebug.log('Connected to Waku');
      WakuRelayerWakuCore.waku = waku;
      WakuRelayerWakuCore.hasError = false;
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      WakuRelayerWakuCore.hasError = true;
      throw err;
    }
  };

  static getMeshPeerCount(): number {
    return this.waku?.relay.getMeshPeers().length ?? 0;
  }

  private static async waitForRemotePeer(waku: RelayNode) {
    try {
      const protocols = [Protocols.Relay];
      await promiseTimeout(
        waitForRemotePeer(waku, protocols),
        WakuRelayerWakuCore.peerDiscoveryTimeout,
      );
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
      throw new Error(err.message);
    }
  }

  static async relayMessage(data: object, contentTopic: string): Promise<void> {
    if (!WakuRelayerWakuCore.waku?.relay) {
      throw new Error('No Waku Relay found.');
    }

    const dataString = JSON.stringify(data);
    const payload = utf8ToBytes(dataString);
    const message: IMessage = { payload };

    try {
      await WakuRelayerWakuCore.waku.relay.send(
        createEncoder({ contentTopic }),
        message,
      );
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
    }
  }
}
