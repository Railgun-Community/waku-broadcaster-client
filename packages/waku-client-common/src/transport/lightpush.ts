import {
  GIVE_UP_MS,
  REPLY_REPUBLISH_COUNT,
  REPLY_REPUBLISH_INTERVAL_MS,
  RETRY_CADENCE_MS,
} from '@zeno/shared-models';
import { ZenoTransportError } from './errors.js';

/** Seam to the underlying Lightpush layer; injected so unit tests never touch @waku/sdk. */
export type PublishFn = (msg: {
  topic: string;
  payload: Uint8Array;
  ephemeral: boolean;
}) => Promise<void>;

/**
 * Send classes (spec section 6): ads and intents publish once; encrypted
 * replies (quotes, winner notify, setup rounds) republish 10x at 3s spacing.
 */
export type SendClass = 'ad' | 'reply';

export interface SendRequest {
  topic: string;
  payload: Uint8Array;
  klass: SendClass;
  ephemeral: boolean;
}

export interface SendReport {
  attempts: number;
  publishes: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Publishes with the spec's retry budget: failed attempts retry at the 2s
 * cadence until the 60s give-up, then reject with a `send-timeout` error.
 *
 * @returns attempt and publish counts for observability.
 * @throws ZenoTransportError kind `send-timeout` when the budget is exhausted.
 */
export async function sendWithRetry(publish: PublishFn, req: SendRequest): Promise<SendReport> {
  const target = req.klass === 'reply' ? REPLY_REPUBLISH_COUNT : 1;
  const deadline = Date.now() + GIVE_UP_MS;
  let attempts = 0;
  let publishes = 0;
  while (publishes < target) {
    attempts += 1;
    try {
      // Sequential by design: publishes are spaced in time, never parallel.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await publish({ topic: req.topic, payload: req.payload, ephemeral: req.ephemeral });
      publishes += 1;
      if (publishes < target) {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await sleep(REPLY_REPUBLISH_INTERVAL_MS);
      }
    } catch {
      if (Date.now() + RETRY_CADENCE_MS > deadline) {
        throw new ZenoTransportError('send-timeout', `gave up after ${attempts} attempts`, {
          topic: req.topic,
          attempts,
        });
      }
      // oxlint-disable-next-line eslint/no-await-in-loop
      await sleep(RETRY_CADENCE_MS);
    }
  }
  return { attempts, publishes };
}
