import { readFileSync } from 'node:fs';
import type { IntentMessageData, Result } from '@zeno/shared-models';
import {
  createFilterManager,
  type FilterManager,
  type FilterNode,
} from '../../transport/filter.js';
import type { PublishFn } from '../../transport/lightpush.js';

/** The Phase 1 golden intent fixture: pinned key material, data, and signature. */
export interface IntentFixture {
  privateKey: string;
  publicKey: string;
  data: IntentMessageData;
  canonical: string;
  signature: string;
}

export function loadIntentFixture(): IntentFixture {
  const url = new URL('../../../../shared-models/src/tests/fixtures/intent.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as IntentFixture;
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export const utf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Entropy stub that hands out pre-seeded buffers in order and pins the
 * requested sizes: `broadcastIntent` draws 16 bytes for the intentId first,
 * then 32 bytes for the ephemeral identity secret.
 */
export function queueEntropy(queue: Uint8Array[]): (n: number) => Uint8Array {
  const remaining = [...queue];
  return (n: number): Uint8Array => {
    const next = remaining.shift();
    if (next === undefined) {
      throw new Error(`entropy queue exhausted (requested ${n} bytes)`);
    }
    if (next.length !== n) {
      throw new Error(`entropy size mismatch: requested ${n} bytes, queued ${next.length}`);
    }
    return next;
  };
}

type IntentParamFields =
  | 'chain'
  | 'sellToken'
  | 'buyToken'
  | 'sellAmount'
  | 'deadline'
  | 'allowedPools'
  | 'escrowParams';

/** Projects the broadcast params out of pinned fixture data. */
export function intentParamsFrom(
  data: IntentMessageData,
): Pick<IntentMessageData, IntentParamFields> {
  const { chain, sellToken, buyToken, sellAmount, deadline, allowedPools, escrowParams } = data;
  return { chain, sellToken, buyToken, sellAmount, deadline, allowedPools, escrowParams };
}

export interface PublishRecord {
  topic: string;
  payload: Uint8Array;
  ephemeral: boolean;
}

/**
 * Real filter manager over an injected node, plus a recording publish. The
 * shared `log` keeps subscribe and publish entries in call order so ordering
 * invariants (subscribe-before-publish) are assertable.
 */
export interface BroadcastHarness {
  filterManager: FilterManager;
  publish: PublishFn;
  /** `subscribe:<topic>` and `publish:<topic>` entries in call order. */
  log: string[];
  published: PublishRecord[];
}

export function createBroadcastHarness(node: FilterNode): BroadcastHarness {
  const log: string[] = [];
  const published: PublishRecord[] = [];
  const filterManager = createFilterManager({
    subscribe: (topic, handler) => {
      log.push(`subscribe:${topic}`);
      return node.subscribe(topic, handler);
    },
  });
  const publish: PublishFn = (msg) => {
    log.push(`publish:${msg.topic}`);
    published.push({ topic: msg.topic, payload: msg.payload, ephemeral: msg.ephemeral });
    return Promise.resolve();
  };
  return { filterManager, publish, log, published };
}
