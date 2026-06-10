/** Seam to the Store query layer; injected so unit tests never touch @waku/sdk. */
export interface StoreNode {
  query(topic: string): AsyncIterable<StoredMessage>;
}

export interface StoredMessage {
  payload: Uint8Array;
  timestampMs: number;
}

/**
 * Replays Store-persisted messages for a topic within the look-back window.
 * Messages older than `now - lookBackMs` are dropped before the handler sees
 * them; a message exactly at the boundary is delivered.
 *
 * @returns the number of messages delivered to the handler.
 */
export async function backfill(
  store: StoreNode,
  topic: string,
  handler: (msg: StoredMessage) => void,
  opts: { lookBackMs: number; now: number },
): Promise<number> {
  const cutoff = opts.now - opts.lookBackMs;
  let delivered = 0;
  for await (const message of store.query(topic)) {
    if (message.timestampMs >= cutoff) {
      handler(message);
      delivered += 1;
    }
  }
  return delivered;
}
