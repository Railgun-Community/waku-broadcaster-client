import { describe, expect, test } from 'vitest';
import { backfill } from './store.js';
import type { MockMessage } from './tests/mocks.js';

const NOW = 1_781_100_000_000;
const topic = '/zeno/v0/0-1-intents/json';

function storeWith(messages: MockMessage[]): {
  query: (t: string) => AsyncIterable<MockMessage>;
  queriedTopics: string[];
} {
  const queriedTopics: string[] = [];
  return {
    queriedTopics,
    query: (t: string) => {
      queriedTopics.push(t);
      return (async function* () {
        for (const m of messages) {
          yield m;
        }
      })();
    },
  };
}

describe('backfill', () => {
  test('delivers messages inside the look-back window', async () => {
    const inWindow: MockMessage = { payload: new Uint8Array([1]), timestampMs: NOW - 30_000 };
    const store = storeWith([inWindow]);
    const received: MockMessage[] = [];
    const count = await backfill(store, topic, (m) => received.push(m), {
      lookBackMs: 60_000,
      now: NOW,
    });
    expect(count).toBe(1);
    expect(received).toEqual([inWindow]);
  });

  test('drops messages older than the look-back window before the handler sees them', async () => {
    const tooOld: MockMessage = { payload: new Uint8Array([2]), timestampMs: NOW - 61_000 };
    const fresh: MockMessage = { payload: new Uint8Array([3]), timestampMs: NOW - 1000 };
    const store = storeWith([tooOld, fresh]);
    const received: MockMessage[] = [];
    const count = await backfill(store, topic, (m) => received.push(m), {
      lookBackMs: 60_000,
      now: NOW,
    });
    expect(count).toBe(1);
    expect(received).toEqual([fresh]);
  });

  test('queries exactly the requested topic', async () => {
    const store = storeWith([]);
    await backfill(store, topic, () => {}, { lookBackMs: 60_000, now: NOW });
    expect(store.queriedTopics).toEqual([topic]);
  });

  test('a message exactly at the window boundary is delivered', async () => {
    const boundary: MockMessage = { payload: new Uint8Array([4]), timestampMs: NOW - 60_000 };
    const store = storeWith([boundary]);
    const count = await backfill(store, topic, () => {}, { lookBackMs: 60_000, now: NOW });
    expect(count).toBe(1);
  });
});
