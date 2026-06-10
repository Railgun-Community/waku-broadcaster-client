import {
  canonicalize,
  encodeMessage,
  SOLVER_AD_CADENCE_MS,
  SOLVER_AD_JITTER_MS,
  type ChainRef,
  type SolverAdMessageData,
} from '@zeno/shared-models';
// Side-effect import: wires pure-JS SHA-512 into noble's registry so injected
// sign callbacks using @noble/ed25519 resolve in microtasks (fake-timer safe).
// oxlint-disable-next-line import/no-unassigned-import
import '../util/ed25519.js';
import type { PublishFn } from '../transport/lightpush.js';
import { topicForSolvers } from '../transport/topics.js';
import { utf8Encode } from '../util/hex.js';

export interface SolverAdPublisher {
  start(): void;
  stop(): void;
}

/**
 * Solver-side ad loop: every 15s (uniform jitter of plus or minus 2s,
 * re-drawn per tick) builds, signs, and publishes an ad with `ephemeral=true`.
 *
 * The publisher never sees a private key: `sign` is an injected callback (the
 * solver identity boundary). Publishes go out once per tick with no in-tick
 * retry; the next tick is the retry, so a failed publish logs and the loop
 * survives.
 */
export function createSolverAdPublisher(deps: {
  chain: ChainRef;
  buildAd: (now: number) => SolverAdMessageData;
  sign: (bytes: Uint8Array) => Promise<string>;
  publish: PublishFn;
  random?: () => number;
  logger?: { error: (msg: string) => void };
}): SolverAdPublisher {
  const random = deps.random ?? Math.random;
  const topic = topicForSolvers(deps.chain);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const nextDelay = (): number => SOLVER_AD_CADENCE_MS + (random() * 2 - 1) * SOLVER_AD_JITTER_MS;

  const tick = async (): Promise<void> => {
    try {
      const data = deps.buildAd(Date.now());
      const signature = await deps.sign(utf8Encode(canonicalize(data)));
      await deps.publish({
        topic,
        payload: utf8Encode(encodeMessage({ data, signature })),
        ephemeral: true,
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      deps.logger?.error(`solver ad publish failed: ${detail}`);
    }
    if (running) {
      timer = setTimeout(() => {
        void tick();
      }, nextDelay());
    }
  };

  return {
    start: () => {
      if (running) {
        return;
      }
      running = true;
      timer = setTimeout(() => {
        void tick();
      }, 0);
    },
    stop: () => {
      running = false;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}
