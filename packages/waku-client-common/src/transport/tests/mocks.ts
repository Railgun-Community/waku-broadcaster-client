import type { HandledKeysPersistence } from '../handled-keys.js';

/** Message handed to Filter/Store handlers in tests. */
export interface MockMessage {
  payload: Uint8Array;
  timestampMs: number;
}

/** Scriptable stand-in for the node surface the transport wrappers consume. */
export function createMockNode(): {
  peerCount: () => number;
  setPeerCount: (n: number) => void;
  stop: () => Promise<void>;
  stopCalls: () => number;
  subscribe: (topic: string, cb: (msg: MockMessage) => void) => Promise<() => Promise<void>>;
  push: (topic: string, msg: MockMessage) => void;
  subscribedTopics: () => string[];
} {
  let peers = 0;
  let stops = 0;
  const handlers = new Map<string, Set<(msg: MockMessage) => void>>();
  return {
    peerCount: () => peers,
    setPeerCount: (n: number) => {
      peers = n;
    },
    stop: () => {
      stops += 1;
      return Promise.resolve();
    },
    stopCalls: () => stops,
    subscribe: (topic, cb) => {
      const set = handlers.get(topic) ?? new Set();
      set.add(cb);
      handlers.set(topic, set);
      return Promise.resolve(() => {
        set.delete(cb);
        if (set.size === 0) {
          handlers.delete(topic);
        }
        return Promise.resolve();
      });
    },
    push: (topic, msg) => {
      for (const cb of handlers.get(topic) ?? []) {
        cb(msg);
      }
    },
    subscribedTopics: () => [...handlers.keys()],
  };
}

/** In-memory persistence that survives "restart" (new HandledKeys instance). */
export function createMemoryPersistence(): HandledKeysPersistence & { saved: () => string[] } {
  let stored: string[] = [];
  return {
    load: () => Promise.resolve([...stored]),
    save: (keys: string[]) => {
      stored = [...keys];
      return Promise.resolve();
    },
    saved: () => [...stored],
  };
}
