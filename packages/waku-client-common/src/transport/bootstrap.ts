import { DEFAULT_CLUSTER_ID, DEFAULT_SHARD_ID } from '@zeno/shared-models';
import { ZenoTransportError } from './errors.js';

/** Network selection for the approved ladder: launch on TWN, own shard later. */
export interface ZenoNetworkConfig {
  clusterId: number;
  shardId: number;
  /** DNS-discovery tree; resolved through an injected resolver. */
  enrTree?: string;
  /** Preferred peers, dialed first; the Zeno-operated TWN member nodes live here. */
  staticPeers: string[];
  /** Bounded admission, Railgun parity. */
  peerExchange: { maxBootstrapPeers: number; maxConnections: number };
}

const BOUNDED_PEER_EXCHANGE = { maxBootstrapPeers: 2, maxConnections: 5 } as const;

/** Launch rung: piggyback The Waku Network (cluster 1) plus Zeno member nodes. */
export const ZENO_DEV_NETWORK: ZenoNetworkConfig = {
  clusterId: 1,
  shardId: 0,
  staticPeers: [],
  peerExchange: BOUNDED_PEER_EXCHANGE,
};

/** Scale rung: Zeno-own static shard with a Zeno-operated ENR tree. */
export const ZENO_PROD_NETWORK: ZenoNetworkConfig = {
  clusterId: DEFAULT_CLUSTER_ID,
  shardId: DEFAULT_SHARD_ID,
  staticPeers: [],
  peerExchange: BOUNDED_PEER_EXCHANGE,
};

/**
 * Resolves the bootstrap peer list: static peers first (the preferred Zeno
 * member nodes), then ENR-tree discovery when configured.
 *
 * @throws ZenoTransportError kind `node-init-failed` when no peer source
 *   yields anything to connect to.
 */
export async function resolveBootstrap(
  config: ZenoNetworkConfig,
  deps: { resolveEnrTree: (tree: string) => Promise<string[]> },
): Promise<string[]> {
  const peers = [...config.staticPeers];
  if (config.enrTree !== undefined) {
    for (const peer of await deps.resolveEnrTree(config.enrTree)) {
      if (!peers.includes(peer)) {
        peers.push(peer);
      }
    }
  }
  if (peers.length === 0) {
    throw new ZenoTransportError('node-init-failed', 'no bootstrap peers configured or resolved');
  }
  return peers;
}
