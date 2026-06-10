/** Seam to the Filter layer; injected so unit tests never touch @waku/sdk. */
export interface FilterNode {
  subscribe(topic: string, handler: (msg: FilterMessage) => void): Promise<() => Promise<void>>;
}

export interface FilterMessage {
  payload: Uint8Array;
  timestampMs: number;
}

export interface FilterManager {
  subscribe(topic: string, handler: (msg: FilterMessage) => void): Promise<() => Promise<void>>;
  activeTopics(): string[];
  /** Unsubscribes everything; asserts the no-leaked-subscriptions invariant. */
  shutdown(): Promise<void>;
  /** Resubscribes every active topic on a replacement node (reinit path). */
  transferTo(node: FilterNode): Promise<void>;
}

interface Subscription {
  handler: (msg: FilterMessage) => void;
  unsubscribe: () => Promise<void>;
}

/**
 * Multiplexes N topic subscriptions over one node connection. One manager per
 * client; per-intent quote topics are subscriptions here, never new nodes.
 */
export function createFilterManager(initialNode: FilterNode): FilterManager {
  let node = initialNode;
  const subscriptions = new Map<string, Subscription>();

  return {
    subscribe: async (topic, handler) => {
      const unsubscribe = await node.subscribe(topic, handler);
      subscriptions.set(topic, { handler, unsubscribe });
      return async () => {
        const current = subscriptions.get(topic);
        if (current !== undefined) {
          subscriptions.delete(topic);
          await current.unsubscribe();
        }
      };
    },
    activeTopics: () => [...subscriptions.keys()],
    shutdown: async () => {
      const pending = [...subscriptions.values()].map((sub) => sub.unsubscribe());
      subscriptions.clear();
      await Promise.all(pending);
    },
    transferTo: async (replacement) => {
      node = replacement;
      for (const [topic, sub] of subscriptions) {
        // Sequential: keeps resubscription deterministic during reinit.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await sub.unsubscribe().catch(() => undefined);
        // oxlint-disable-next-line eslint/no-await-in-loop
        const unsubscribe = await node.subscribe(topic, sub.handler);
        subscriptions.set(topic, { handler: sub.handler, unsubscribe });
      }
    },
  };
}
