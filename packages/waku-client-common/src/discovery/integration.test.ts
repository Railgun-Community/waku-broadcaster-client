import * as ed from '@noble/ed25519';
import { type SolverAdMessageData } from '@zeno/shared-models';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFilterManager } from '../transport/filter.js';
import { createMockNode } from '../transport/tests/mocks.js';
import { topicForSolvers } from '../transport/topics.js';
import { createSolverAdCache } from './solver-ad-cache.js';
import { createSolverAdHandler } from './solver-ad-message-handler.js';
import { createSolverAdPublisher } from './solver-ad-publisher.js';
import { createAllowlist } from './trusted-solver-allowlist.js';
import { adVariant, FIXTURE_NOW, loadSolverAdFixture } from './tests/helpers.js';

const fixture = loadSolverAdFixture();
const chain = fixture.data.chain;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('discovery round-trip over mocked Waku', () => {
  test('an ad published by the solver side lands in the sender cache', async () => {
    const node = createMockNode();

    // Sender side: handler subscribed through the shared filter manager.
    const cache = createSolverAdCache();
    const handle = createSolverAdHandler({ cache, allowlist: createAllowlist(), chain });
    const manager = createFilterManager(node);
    await manager.subscribe(topicForSolvers(chain), (msg) => {
      void handle(msg.payload, { now: Date.now() });
    });

    // Solver side: publisher whose publish seam pushes onto the mock node.
    const publisher = createSolverAdPublisher({
      chain,
      buildAd: (now: number): SolverAdMessageData => adVariant(fixture, { expiry: now + 300_000 }),
      sign: async (bytes) =>
        Buffer.from(await ed.signAsync(bytes, Buffer.from(fixture.privateKey, 'hex'))).toString(
          'hex',
        ),
      publish: (msg) => {
        node.push(msg.topic, { payload: msg.payload, timestampMs: Date.now() });
        return Promise.resolve();
      },
      random: () => 0.5,
      logger: { error: () => {} },
    });

    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    publisher.stop();

    const ads = cache.getSolverAds(chain, { now: FIXTURE_NOW });
    expect(ads).toHaveLength(1);
    expect(ads[0]?.solverPubkey).toBe(fixture.data.solverPubkey);

    await manager.shutdown();
    cache.dispose();
  });
});
