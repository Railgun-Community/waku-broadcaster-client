import type { HandledKeysPersistence, ZenoNetworkConfig } from '@zeno/waku-client-common';
import { createLightNode, type LightNode } from '@waku/sdk';

/**
 * Creates a browser-side Waku LightNode for the configured network. Bootstrap
 * peers are dialed by the caller (see resolveBootstrap); DNS discovery and
 * peer exchange wiring arrive with the public client in Phase 8.
 */
export async function createWebLightNode(config: ZenoNetworkConfig): Promise<LightNode> {
  // Static sharding: the node joins the cluster; the shard is selected per
  // message via routing info (config.shardId is consumed by the Phase 8 client).
  return createLightNode({
    defaultBootstrap: false,
    networkConfig: { clusterId: config.clusterId },
  });
}

const DB_NAME = 'zeno-waku-client';
const STORE_NAME = 'handled-keys';
const RECORD_KEY = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(STORE_NAME);
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('indexedDB open failed')),
      { once: true },
    );
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('indexedDB request failed')),
      { once: true },
    );
  });
}

/** Replay-drop persistence over IndexedDB (web parity with the Node Level adapter). */
export function createIdbHandledKeysPersistence(): HandledKeysPersistence {
  return {
    load: async () => {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const raw = await requestToPromise<unknown>(tx.objectStore(STORE_NAME).get(RECORD_KEY));
      db.close();
      return Array.isArray(raw) ? (raw as string[]) : [];
    },
    save: async (keys) => {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await requestToPromise(tx.objectStore(STORE_NAME).put(keys, RECORD_KEY));
      db.close();
    },
  };
}
