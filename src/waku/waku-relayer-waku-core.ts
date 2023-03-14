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

export class WakuRelayerWakuCore {
  static hasError = false;
  private static connecting = false;

  static directPeers: string[];

  static waku: Optional<Waku>;

  static initWaku = async (chain: Chain): Promise<void> => {
    try {
      if (WakuRelayerWakuCore.connecting) {
        return;
      }
      await WakuRelayerWakuCore.connect();
      if (!WakuRelayerWakuCore.waku) {
        RelayerDebug.log('No waku instance found');
        throw new Error('No waku instance found');
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
    if (WakuRelayerWakuCore.connecting) {
      return;
    }

    // Resets connection status to "Connecting" for this network.
    RelayerFeeCache.resetCache(chain);

    await WakuRelayerWakuCore.initWaku(chain);
  };

  private static connect = async (fleet = Fleet.Prod): Promise<void> => {
    try {
      if (WakuRelayerWakuCore.connecting) {
        return;
      }
      if (WakuRelayerWakuCore.waku?.isStarted) {
        await WakuRelayerWakuCore.waku.stop();
        WakuRelayerWakuCore.waku = undefined;
      }

      WakuRelayerWakuCore.connecting = true;
      WakuRelayerWakuCore.hasError = false;

      RelayerDebug.log(`Creating waku relay client`);
      const waku: Waku = await createRelayNode({
        libp2p: {
          peerDiscovery: [
            bootstrap({ list: getPredefinedBootstrapNodes(fleet) }),
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
      for (const peer of waku.relay.getPeers()) {
        RelayerDebug.log(JSON.stringify(peer));
      }

      RelayerDebug.log('Connected to Waku');
      WakuRelayerWakuCore.waku = waku;
      WakuRelayerWakuCore.connecting = false;
      WakuRelayerWakuCore.hasError = false;

      RelayerDebug.log('Dialing direct peers (synchronously)');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.dialDirectPeer(waku, this.directPeers);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
      if (fleet === Fleet.Prod) {
        await WakuRelayerWakuCore.connect(Fleet.Test);
        return;
      }
      WakuRelayerWakuCore.connecting = false;
      WakuRelayerWakuCore.hasError = true;
      throw err;
    }
  };

  private static async waitForRemotePeer(waku: Waku) {
    try {
      const timeout = 10000;
      await promiseTimeout(waitForRemotePeer(waku, [Protocols.Relay]), timeout);
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      RelayerDebug.error(err);
      throw new Error(
        'Error connecting to Relayer network. Private transaction features will be limited.',
      );
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
        createEncoder(contentTopic),
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
