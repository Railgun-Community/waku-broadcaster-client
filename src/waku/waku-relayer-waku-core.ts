import { Chain, promiseTimeout } from '@railgun-community/shared-models';
import { waitForRemotePeer, createEncoder } from '@waku/core';
import { Waku, Protocols, IMessage } from '@waku/interfaces';
import { WakuObservers } from './waku-observers';
import { RelayerDebug } from '../utils/relayer-debug';
import { RelayerFeeCache } from '../fees/relayer-fee-cache';
import { utf8ToBytes } from '../utils/conversion';
import { multiaddr } from '@multiformats/multiaddr';
import { bootstrap } from '@libp2p/bootstrap';
import { createRelayNode } from '@waku/create';
import {
  Fleet,
  getPredefinedBootstrapNodes,
} from '@waku/core/lib/predefined_bootstrap_nodes';

const staticPeers: string[] = [
  '/dns4/relayer.crabdance.com/tcp/8000/wss/p2p/16Uiu2HAm9TiCU9ZRPoKMUyo6QQvZTSceSH5ZtX6u353NHgVCtr1W',
  '/dns4/relayer.chickenkiller.com/tcp/8000/wss/p2p/16Uiu2HAmNy49QzXVWHMdhz7DQHXCpk9sHvVua99j3QcShUK8PVSD',
];

export class WakuRelayerWakuCore {
  static hasError = false;

  static directPeers: string[];

  static waku: Optional<Waku>;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      await WakuRelayerWakuCore.connect();
      if (!WakuRelayerWakuCore.waku) {
        RelayerDebug.log('No waku instance found');
        return;
      }
      WakuObservers.resetCurrentChain();
      WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
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

  static disconnect = async () => {
    await WakuRelayerWakuCore.waku?.stop();
    WakuRelayerWakuCore.waku = undefined;
  };

  private static connect = async (fleet = Fleet.Prod): Promise<void> => {
    try {
      WakuRelayerWakuCore.hasError = false;

      RelayerDebug.log(`Creating waku relay client`);
      const bootstrapNodes = getPredefinedBootstrapNodes(fleet, 2);

      const peers = [
        ...new Set([...bootstrapNodes, ...this.directPeers, ...staticPeers]),
      ];
      const waku: Waku = await createRelayNode({
        libp2p: {
          peerDiscovery: [bootstrap({ list: peers })],
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
      RelayerDebug.error(err);
      if (fleet === Fleet.Prod) {
        await WakuRelayerWakuCore.connect(Fleet.Test);
        return;
      }
      WakuRelayerWakuCore.hasError = true;
      throw err;
    }
  };

  private static async waitForRemotePeer(waku: Waku) {
    try {
      const timeout = 20000;
      await promiseTimeout(waitForRemotePeer(waku, [Protocols.Relay]), timeout);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
      throw new Error(err.message);
    }
  }

  private static async dialDirectPeer(
    waku: Waku,
    peerList: string[],
  ): Promise<void> {
    try {
      if (!peerList.length) {
        return;
      }
      const nextMultiAddr = multiaddr(peerList[0]);
      await promiseTimeout(waku.dial(nextMultiAddr), 6000);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.log(`Error connecting to direct peer ${peerList[0]}`);
      RelayerDebug.error(err);
      if (peerList.length) {
        return this.dialDirectPeer(waku, peerList.slice(1));
      }
      // NOTE: Do not throw here, as direct peer connection is helpful but not necessary.
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
