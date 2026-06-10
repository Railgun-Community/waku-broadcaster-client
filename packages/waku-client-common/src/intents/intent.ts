import {
  canonicalize,
  encodeMessage,
  INTENT_EXPIRY_MS,
  IntentMessageData,
} from '@zeno/shared-models';
import type { FilterManager } from '../transport/filter.js';
import type { PublishFn } from '../transport/lightpush.js';
import { topicForIntents, topicForQuotes } from '../transport/topics.js';
import { bytesToHex, utf8Encode } from '../util/hex.js';
import { createIntentIdentity } from './intent-ephemeral-identity.js';
import { createIntentHandle, type IntentHandle } from './intent-handle.js';

export interface IntentParams extends Pick<
  IntentMessageData,
  'allowedPools' | 'buyToken' | 'chain' | 'deadline' | 'escrowParams' | 'sellAmount' | 'sellToken'
> {
  /** Intent ad validity window; defaults to INTENT_EXPIRY_MS (60s). */
  expiryMs?: number;
}

export interface BroadcastDeps {
  filterManager: FilterManager;
  publish: PublishFn;
  entropy: (n: number) => Uint8Array;
  now: () => number;
}

/**
 * Sender-side intent broadcast: mints the per-intent ephemeral identity,
 * validates and signs the intent, subscribes the quote topic BEFORE
 * publishing (no quote can land in the gap), then publishes once with
 * `ephemeral=false` so late-joining solvers Store-backfill it.
 *
 * @throws Error before any subscribe or publish when params fail the
 *   shared-models schema (programmer error, not a network condition).
 */
export async function broadcastIntent(
  params: IntentParams,
  deps: BroadcastDeps,
): Promise<IntentHandle> {
  const intentId = bytesToHex(deps.entropy(16));
  const identity = await createIntentIdentity({ entropy: deps.entropy });
  const data: IntentMessageData = {
    allowedPools: params.allowedPools,
    buyToken: params.buyToken,
    chain: params.chain,
    deadline: params.deadline,
    escrowParams: params.escrowParams,
    expiry: deps.now() + (params.expiryMs ?? INTENT_EXPIRY_MS),
    intentEphPubkey: identity.publicKeyHex(),
    intentId,
    sellAmount: params.sellAmount,
    sellToken: params.sellToken,
  };
  const checked = IntentMessageData.safeParse(data);
  if (!checked.success) {
    identity.dispose();
    throw new Error(`invalid intent params: ${checked.error.issues[0]?.message ?? 'schema'}`);
  }
  const signature = await identity.sign(utf8Encode(canonicalize(data)));

  const handle = createIntentHandle({
    intentId,
    data,
    identity,
    unsubscribe: async () => {
      await unsubscribe();
    },
  });
  const unsubscribe = await deps.filterManager.subscribe(
    topicForQuotes(data.chain, intentId),
    (msg) => {
      handle.onQuotePayload(msg.payload);
    },
  );
  await deps.publish({
    topic: topicForIntents(data.chain),
    payload: utf8Encode(encodeMessage({ data, signature })),
    ephemeral: false,
  });
  return handle;
}
