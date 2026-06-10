import { describe, expect, test } from 'vitest';
import { createFilterManager } from './filter.js';
import { createMockNode, type MockMessage } from './tests/mocks.js';

const topicA = '/zeno/v0/0-1-intents/json';
const topicB = '/zeno/v0/0-1-winner/json';
const message: MockMessage = { payload: new Uint8Array([1]), timestampMs: 1_781_100_000_000 };

describe('createFilterManager', () => {
  test('delivers pushed messages to the subscribed handler', async () => {
    const node = createMockNode();
    const manager = createFilterManager(node);
    const received: MockMessage[] = [];
    await manager.subscribe(topicA, (m) => received.push(m));
    node.push(topicA, message);
    expect(received).toHaveLength(1);
  });

  test('subscribe and unsubscribe are symmetric', async () => {
    const node = createMockNode();
    const manager = createFilterManager(node);
    const unsubscribe = await manager.subscribe(topicA, () => {});
    expect(manager.activeTopics()).toEqual([topicA]);
    await unsubscribe();
    expect(manager.activeTopics()).toEqual([]);
    expect(node.subscribedTopics()).toEqual([]);
  });

  test('multiplexes many topics over one manager', async () => {
    const node = createMockNode();
    const manager = createFilterManager(node);
    await manager.subscribe(topicA, () => {});
    await manager.subscribe(topicB, () => {});
    expect(manager.activeTopics().toSorted()).toEqual([topicA, topicB].toSorted());
  });

  test('shutdown unsubscribes everything and leaves no leaked subscriptions', async () => {
    const node = createMockNode();
    const manager = createFilterManager(node);
    await manager.subscribe(topicA, () => {});
    await manager.subscribe(topicB, () => {});
    await manager.shutdown();
    expect(manager.activeTopics()).toEqual([]);
    expect(node.subscribedTopics()).toEqual([]);
  });

  test('transferTo resubscribes the same topics on a new node (reinit path)', async () => {
    const node = createMockNode();
    const manager = createFilterManager(node);
    const received: MockMessage[] = [];
    await manager.subscribe(topicA, (m) => received.push(m));

    const replacement = createMockNode();
    await manager.transferTo(replacement);
    expect(replacement.subscribedTopics()).toEqual([topicA]);

    replacement.push(topicA, message);
    expect(received).toHaveLength(1);
  });
});
