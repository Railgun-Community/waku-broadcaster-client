import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createLifecycle, type LifecycleStatus } from './light-node.js';
import { createMockNode } from './tests/mocks.js';

const POLL = 3000;
const GRACE = 10_000;
const STALL = 120_000;

function harness(overrides: { existingNode?: ReturnType<typeof createMockNode> } = {}): {
  nodes: ReturnType<typeof createMockNode>[];
  statuses: LifecycleStatus[];
  lifecycle: ReturnType<typeof createLifecycle>;
} {
  const nodes: ReturnType<typeof createMockNode>[] = [];
  if (overrides.existingNode) {
    nodes.push(overrides.existingNode);
  }
  const statuses: LifecycleStatus[] = [];
  const lifecycle = createLifecycle({
    createNode: () => {
      const node = createMockNode();
      node.setPeerCount(1);
      nodes.push(node);
      return Promise.resolve(node);
    },
    ...(overrides.existingNode === undefined ? {} : { existingNode: overrides.existingNode }),
    statusCallback: (s) => statuses.push(s),
    pollIntervalMs: POLL,
    graceMs: GRACE,
    stallTimeoutMs: STALL,
  });
  return { nodes, statuses, lifecycle };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createLifecycle', () => {
  test('reports connecting then connected once a peer is available', async () => {
    const { statuses, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;
    expect(statuses.slice(0, 2)).toEqual(['connecting', 'connected']);
  });

  test('peer loss beyond the grace period disconnects and reinitializes', async () => {
    const { nodes, statuses, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;

    const first = nodes[0];
    if (first === undefined) throw new Error('no node created');
    first.setPeerCount(0);
    await vi.advanceTimersByTimeAsync(GRACE + 2 * POLL);
    expect(statuses).toContain('disconnected');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(nodes.length).toBeGreaterThan(1);
    expect(statuses[statuses.length - 1]).toBe('connected');
  });

  test('a brief peer dip inside the grace period does not disconnect', async () => {
    const { nodes, statuses, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;

    nodes[0]?.setPeerCount(0);
    await vi.advanceTimersByTimeAsync(POLL);
    nodes[0]?.setPeerCount(2);
    await vi.advanceTimersByTimeAsync(2 * POLL);
    expect(statuses).not.toContain('disconnected');
  });

  test('message stall reinitializes only while subscriptions are active', async () => {
    const { nodes, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;

    await vi.advanceTimersByTimeAsync(STALL + 2 * POLL);
    expect(nodes).toHaveLength(1);

    lifecycle.setSubscriptionCount(1);
    await vi.advanceTimersByTimeAsync(STALL + 2 * POLL);
    expect(nodes.length).toBeGreaterThan(1);
  });

  test('message activity resets the stall detector', async () => {
    const { nodes, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;
    lifecycle.setSubscriptionCount(1);

    // Sequential on purpose: each advance must run with the previous activity applied.
    // oxlint-disable-next-line eslint/no-await-in-loop
    for (let i = 0; i < 5; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await vi.advanceTimersByTimeAsync(STALL / 2);
      lifecycle.notifyActivity();
    }
    expect(nodes).toHaveLength(1);
  });

  test('stop is terminal and stops an owned node', async () => {
    const { nodes, statuses, lifecycle } = harness();
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;

    await lifecycle.stop();
    expect(statuses[statuses.length - 1]).toBe('stopped');
    expect(nodes[0]?.stopCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(10 * POLL);
    expect(nodes).toHaveLength(1);
  });

  test('a shared (existing) node is used as-is and never stopped by us', async () => {
    const shared = createMockNode();
    shared.setPeerCount(1);
    const { nodes, lifecycle } = harness({ existingNode: shared });
    const started = lifecycle.start();
    await vi.advanceTimersByTimeAsync(POLL);
    await started;

    expect(nodes).toHaveLength(1);
    await lifecycle.stop();
    expect(shared.stopCalls()).toBe(0);
  });
});
