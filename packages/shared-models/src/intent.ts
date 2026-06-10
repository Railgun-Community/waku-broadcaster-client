import { z } from 'zod';
import { checkExpiry, parseJson, runSchema, type DecodeOpts } from './codec.js';
import { POOL_IDS } from './constants.js';
import { err, type Result } from './errors.js';
import {
  Address,
  chainEquals,
  ChainRef,
  Hex,
  Hex16,
  Hex32,
  Hex64,
  TimestampMs,
  Uint256String,
} from './scalars.js';

const outOfRange = (message: string): { message: string; params: { kind: string } } => ({
  message,
  params: { kind: 'out-of-range' },
});

/**
 * Escrow construction parameters chosen by the sender (provisional shape;
 * committee pubkey encoding is confirmed with the SWE implementation before
 * fixtures freeze, per spec Q1.6).
 */
export const EscrowParams = z
  .object({
    committeePubkeys: z.array(Hex).min(1),
    pool: z.enum(POOL_IDS),
    refundDeadline: TimestampMs,
    threshold: z.number().int().min(1),
  })
  .refine((p) => p.threshold <= p.committeePubkeys.length, {
    ...outOfRange('threshold must not exceed the committee size'),
    path: ['threshold'],
  });

export type EscrowParams = z.infer<typeof EscrowParams>;

export const IntentMessageData = z
  .object({
    allowedPools: z.array(z.enum(POOL_IDS)).min(1),
    buyToken: Address,
    chain: ChainRef,
    deadline: TimestampMs,
    escrowParams: EscrowParams,
    expiry: TimestampMs,
    intentEphPubkey: Hex32,
    intentId: Hex16,
    sellAmount: Uint256String,
    sellToken: Address,
  })
  .refine((d) => d.sellToken !== d.buyToken, {
    message: 'sellToken and buyToken must differ',
    path: ['buyToken'],
  })
  .refine((d) => d.sellAmount !== '0x0', {
    ...outOfRange('sellAmount must be positive'),
    path: ['sellAmount'],
  })
  .refine((d) => d.deadline > d.expiry, {
    ...outOfRange('deadline must be after intent expiry'),
    path: ['deadline'],
  });

export type IntentMessageData = z.infer<typeof IntentMessageData>;

export const IntentMessage = z.object({
  data: IntentMessageData,
  signature: Hex64,
});

export type IntentMessage = z.infer<typeof IntentMessage>;

/**
 * Decodes a sender intent broadcast from its wire JSON.
 *
 * @param text Raw payload from the intents content topic.
 * @param opts When `now` is given, expired intents are rejected; when `chain`
 *   is given, intents scoped to another chain are rejected.
 */
export function decodeIntentMessage(text: string, opts: DecodeOpts = {}): Result<IntentMessage> {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const parsed = runSchema(IntentMessage, json.value);
  if (!parsed.ok) {
    return parsed;
  }
  const expired = checkExpiry<IntentMessage>('expiry', parsed.value.data.expiry, opts.now);
  if (expired !== undefined) {
    return expired;
  }
  if (opts.chain !== undefined && !chainEquals(parsed.value.data.chain, opts.chain)) {
    return err({ kind: 'chain-mismatch', expected: opts.chain, received: parsed.value.data.chain });
  }
  return parsed;
}
