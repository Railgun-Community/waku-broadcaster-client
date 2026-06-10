import { tcp } from '@libp2p/tcp';
import {
  createLightNode,
  type CreateLibp2pOptions,
} from '@waku/sdk';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { enrTree, wakuDnsDiscovery, wakuPeerExchangeDiscovery } from '@waku/discovery';
import { WakuBroadcasterPeerDiscoveryCoreBase } from './waku-broadcaster-peer-discovery-core-base.js';
import { WAKU_RAILGUN_DEFAULT_PEERS_NODE } from '../models/constants.js';

export class WakuBroadcasterWakuCore extends WakuBroadcasterPeerDiscoveryCoreBase {
  protected static createWakuNode = createLightNode;
  protected static createDnsPeerDiscovery = wakuDnsDiscovery;
  protected static createPeerExchangeDiscovery = wakuPeerExchangeDiscovery;

  protected static getEnrTrees() {
    return enrTree;
  }

  protected static getDefaultPeers(): string[] {
    return WAKU_RAILGUN_DEFAULT_PEERS_NODE;
  }

  protected static getBaseLibp2pOptions(): CreateLibp2pOptions {
    return {
      ...super.getBaseLibp2pOptions(),
      transports: [tcp()],
    };
  }

  protected static applyConnectionLimitGuard() {
    const connectionManager = (this.waku as any)?.connectionManager;
    const dialer = connectionManager?.dialer;
    const libp2p = (this.waku as any)?.libp2p;
    if (!dialer || !libp2p || dialer.__wakuConnectionLimitGuardApplied) {
      return;
    }

    const originalShouldSkipPeer = dialer.shouldSkipPeer?.bind(dialer);
    if (typeof originalShouldSkipPeer !== 'function') {
      return;
    }

    dialer.shouldSkipPeer = async (peerId: any) => {
      const shouldSkip = await originalShouldSkipPeer(peerId);
      if (shouldSkip) {
        return true;
      }

      const connectionCount = libp2p.getConnections().length;
      if (connectionCount >= this.maxConnections) {
        BroadcasterDebug.log(
          `Skipping peer ${this.formatDiscoveryPeerId(peerId)} - max connections ${this.maxConnections} reached`,
        );
        return true;
      }

      return false;
    };

    dialer.__wakuConnectionLimitGuardApplied = true;
  }
}
