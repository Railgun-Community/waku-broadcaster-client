import { tcp } from '@libp2p/tcp';
import { createLightNode, Protocols, type CreateLibp2pOptions } from '@waku/sdk';
import { BroadcasterDebug } from '../utils/broadcaster-debug.js';
import { WakuBroadcasterWakuCoreBase } from './waku-broadcaster-waku-core-base.js';
import { enrTree, wakuDnsDiscovery } from '@waku/discovery';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import { isDefined } from '@railgun-community/shared-models';

export class WakuBroadcasterWakuCore extends WakuBroadcasterWakuCoreBase {
  protected static async connect(): Promise<void> {
    try {
      this.hasError = false;

      BroadcasterDebug.log(`Creating waku broadcast client`);
      const libp2pOptions: CreateLibp2pOptions = {
        transports: [tcp()],
        hideWebSocketInfo: true,
      }
      if (BroadcasterConfig.useDNSDiscovery) {
        const enrTreePeers = []
        if (isDefined(BroadcasterConfig.customDNS)) {
          enrTreePeers.push(...BroadcasterConfig.customDNS.enrTreePeers)
          if (!BroadcasterConfig.customDNS.onlyCustom) {
            enrTreePeers.push(...[enrTree["SANDBOX"], enrTree["TEST"]])
          }
        }
        libp2pOptions.peerDiscovery = [
          wakuDnsDiscovery(enrTreePeers),
        ]
      }
      this.waku = await createLightNode({
        defaultBootstrap: true,
        libp2p: libp2pOptions
      });

      await this.waku.start();

      BroadcasterDebug.log('Waiting for remote peer.');
      await this.waku.waitForPeers([Protocols.Filter, Protocols.LightPush, Protocols.Store], this.peerDiscoveryTimeout)

      BroadcasterDebug.log('Waku initialized and connected to peers');
    } catch (err: any) {
      BroadcasterDebug.log(`Error initializing Waku: ${err.message}`);
      this.hasError = true;
    }
  }
}
