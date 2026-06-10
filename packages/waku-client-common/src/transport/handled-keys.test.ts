import { describe, expect, test } from 'vitest';
import { createHandledKeys } from './handled-keys.js';
import { createMemoryPersistence } from './tests/mocks.js';

describe('createHandledKeys', () => {
  test('remembers added keys and rejects replays', async () => {
    const keys = await createHandledKeys({});
    expect(keys.has('k1')).toBe(false);
    keys.add('k1');
    expect(keys.has('k1')).toBe(true);
  });

  test('evicts the oldest entry on the 10001st insertion (default caps)', async () => {
    const keys = await createHandledKeys({});
    for (let i = 0; i < 10_001; i += 1) {
      keys.add(`key-${i}`);
    }
    expect(keys.size()).toBe(10_000);
    expect(keys.has('key-0')).toBe(false);
    expect(keys.has('key-1')).toBe(true);
    expect(keys.has('key-10000')).toBe(true);
  });

  test('eviction is FIFO with configurable caps', async () => {
    const keys = await createHandledKeys({ memCap: 3 });
    keys.add('a');
    keys.add('b');
    keys.add('c');
    keys.add('d');
    expect(keys.has('a')).toBe(false);
    expect(keys.has('b')).toBe(true);
    expect(keys.has('d')).toBe(true);
  });

  test('flush persists only the newest diskCap keys', async () => {
    const persistence = createMemoryPersistence();
    const keys = await createHandledKeys({ persistence, memCap: 10, diskCap: 2 });
    keys.add('a');
    keys.add('b');
    keys.add('c');
    await keys.flush();
    expect(persistence.saved()).toEqual(['b', 'c']);
  });

  test('a new instance over the same persistence sees flushed keys (restart survival)', async () => {
    const persistence = createMemoryPersistence();
    const first = await createHandledKeys({ persistence, memCap: 10, diskCap: 10 });
    first.add('seen-before');
    await first.flush();

    const second = await createHandledKeys({ persistence, memCap: 10, diskCap: 10 });
    expect(second.has('seen-before')).toBe(true);
    expect(second.has('never-seen')).toBe(false);
  });
});
