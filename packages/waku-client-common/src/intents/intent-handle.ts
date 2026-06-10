import {
  decodeQuoteEnvelope,
  type EciesEnvelope,
  type IntentMessageData,
} from '@zeno/shared-models';
import { utf8Decode } from '../util/hex.js';
import type { IntentIdentity } from './intent-ephemeral-identity.js';

export interface IntentHandle {
  intentId: string;
  /** Exactly what was signed and published. */
  data: IntentMessageData;
  /** The full ephemeral identity lives here; typed to its read surface. */
  identity: { publicKeyHex(): string; dhSecret(): Uint8Array };
  /**
   * Raw quote envelopes from the per-intent topic, schema-validated only.
   * Decryption and selection are the quote layer's job (Phase 6). One shared
   * stream: concurrent iterators compete for elements.
   */
  envelopes(): AsyncIterable<EciesEnvelope>;
  /** Unsubscribes, ends the stream, disposes the identity. Idempotent. */
  cancel(): Promise<void>;
}

interface AsyncQueue<T> {
  push(value: T): void;
  end(): void;
  iterate(): AsyncIterable<T>;
}

function createAsyncQueue<T>(): AsyncQueue<T> {
  const buffered: T[] = [];
  const waiters: ((result: IteratorResult<T>) => void)[] = [];
  let ended = false;
  return {
    push: (value) => {
      if (ended) {
        return;
      }
      const waiter = waiters.shift();
      if (waiter === undefined) {
        buffered.push(value);
      } else {
        waiter({ value, done: false });
      }
    },
    end: () => {
      ended = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ value: undefined, done: true });
      }
    },
    iterate: () => ({
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<T>> => {
          const value = buffered.shift();
          if (value !== undefined) {
            return Promise.resolve({ value, done: false });
          }
          if (ended) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => {
            waiters.push(resolve);
          });
        },
      }),
    }),
  };
}

/** Wires the quote-topic subscription feed into the handle surface. */
export function createIntentHandle(deps: {
  intentId: string;
  data: IntentMessageData;
  identity: IntentIdentity;
  unsubscribe: () => Promise<void>;
}): IntentHandle & { onQuotePayload: (payload: Uint8Array) => void } {
  const queue = createAsyncQueue<EciesEnvelope>();
  let cancelled = false;
  return {
    intentId: deps.intentId,
    data: deps.data,
    identity: deps.identity,
    envelopes: () => queue.iterate(),
    onQuotePayload: (payload) => {
      const decoded = decodeQuoteEnvelope(utf8Decode(payload));
      if (decoded.ok) {
        queue.push(decoded.value);
      }
    },
    cancel: async () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      await deps.unsubscribe();
      queue.end();
      deps.identity.dispose();
    },
  };
}
