import * as ed from '@noble/ed25519';
import { canonicalize, decodeSolverAdMessage, type SolverAdMessageData } from '@zeno/shared-models';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { topicForSolvers } from '../transport/topics.js';
import { createSolverAdPublisher } from './solver-ad-publisher.js';
import { adVariant, FIXTURE_NOW, loadSolverAdFixture, utf8 } from './tests/helpers.js';

const fixture = loadSolverAdFixture();
const chain = fixture.data.chain;
const SK = Buffer.from(fixture.privateKey, 'hex');

interface Published {
  topic: string;
  payload: Uint8Array;
  ephemeral: boolean;
  at: number;
}

function harness(opts: { random?: () => number; failFirst?: number } = {}): {
  published: Published[];
  publisher: ReturnType<typeof createSolverAdPublisher>;
} {
  const published: Published[] = [];
  let failures = opts.failFirst ?? 0;
  const publisher = createSolverAdPublisher({
    chain,
    buildAd: (now: number): SolverAdMessageData => adVariant(fixture, { expiry: now + 300_000 }),
    sign: async (bytes) => Buffer.from(await ed.signAsync(bytes, SK)).toString('hex'),
    publish: (msg) => {
      if (failures > 0) {
        failures -= 1;
        return Promise.reject(new Error('lightpush down'));
      }
      published.push({ ...msg, at: Date.now() });
      return Promise.resolve();
    },
    random: opts.random ?? (() => 0.5),
    logger: { error: () => {} },
  });
  return { published, publisher };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSolverAdPublisher', () => {
  test('publishes immediately on start, to the solvers topic, ephemeral', async () => {
    const { published, publisher } = harness();
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toHaveLength(1);
    expect(published[0]?.topic).toBe(topicForSolvers(chain));
    expect(published[0]?.ephemeral).toBe(true);
    publisher.stop();
  });

  test('publishes every 15s with zero jitter when random is centered', async () => {
    const { published, publisher } = harness({ random: () => 0.5 });
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(published.map((p) => p.at)).toEqual([
      FIXTURE_NOW,
      FIXTURE_NOW + 15_000,
      FIXTURE_NOW + 30_000,
    ]);
    publisher.stop();
  });

  test('jitter stays within plus or minus 2s of the cadence', async () => {
    const { published, publisher } = harness({ random: () => 1 });
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(17_000);
    expect(published).toHaveLength(2);
    expect((published[1]?.at ?? 0) - (published[0]?.at ?? 0)).toBe(17_000);
    publisher.stop();
  });

  test('the published payload decodes and its signature verifies (codec round-trip)', async () => {
    const { published, publisher } = harness();
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = published[0];
    if (first === undefined) throw new Error('nothing published');
    const decoded = decodeSolverAdMessage(new TextDecoder().decode(first.payload), {
      now: FIXTURE_NOW,
      chain,
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const valid = await ed.verifyAsync(
        Buffer.from(decoded.value.signature, 'hex'),
        utf8(canonicalize(decoded.value.data)),
        Buffer.from(decoded.value.data.solverPubkey, 'hex'),
      );
      expect(valid).toBe(true);
    }
    publisher.stop();
  });

  test('a publish failure is logged and the loop continues', async () => {
    const { published, publisher } = harness({ failFirst: 1 });
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(published).toHaveLength(1);
    publisher.stop();
  });

  test('stop halts the loop', async () => {
    const { published, publisher } = harness();
    publisher.start();
    await vi.advanceTimersByTimeAsync(0);
    publisher.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(published).toHaveLength(1);
  });
});
