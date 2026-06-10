import type { HandledKeysPersistence, ZenoNetworkConfig } from '@zeno/waku-client-common';
import { createLightNode, type LightNode } from '@waku/sdk';

/**
 * Creates a Node-side Waku LightNode for the configured network. Bootstrap
 * peers are dialed by the caller (see resolveBootstrap); DNS discovery and
 * peer exchange wiring arrive with the public client in Phase 8.
 */
export async function createNodeLightNode(config: ZenoNetworkConfig): Promise<LightNode> {
  // Static sharding: the node joins the cluster; the shard is selected per
  // message via routing info (config.shardId is consumed by the Phase 8 client).
  return createLightNode({
    defaultBootstrap: false,
    networkConfig: { clusterId: config.clusterId },
  });
}

/** Minimal async KV the Level adapter wraps; any LevelDOWN-compatible store fits. */
export interface NodeKeyValueStore {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}

const HANDLED_KEYS_KEY = 'zeno-handled-keys';

/**
 * Replay-drop persistence over an injected LevelDOWN-compatible store. The
 * caller owns the database lifecycle; this adapter serializes the key list
 * under a single record.
 */
export function createLevelHandledKeysPersistence(db: NodeKeyValueStore): HandledKeysPersistence {
  return {
    load: async () => {
      const raw = await db.get(HANDLED_KEYS_KEY);
      return raw === undefined ? [] : (JSON.parse(raw) as string[]);
    },
    save: async (keys) => {
      await db.put(HANDLED_KEYS_KEY, JSON.stringify(keys));
    },
  };
}
