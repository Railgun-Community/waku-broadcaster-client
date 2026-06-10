import { z } from 'zod';
import { checkExpiry, parseJson, runSchema, type DecodeOpts } from './codec.js';
import { MAX_SUPPORTED_PAIRS, POOL_IDS } from './constants.js';
import { err, type Result } from './errors.js';
import {
  Address,
  Bps,
  chainEquals,
  ChainRef,
  Hex32,
  Hex64,
  TimestampMs,
  Uint256String,
} from './scalars.js';

const SupportedPair = z
  .object({
    buyToken: Address,
    minSellAmount: Uint256String,
    sellToken: Address,
  })
  .refine((pair) => pair.sellToken !== pair.buyToken, {
    message: 'sellToken and buyToken must differ',
  });

export const SolverAdMessageData = z.object({
  chain: ChainRef,
  expiry: TimestampMs,
  reliability: Bps,
  solverPubkey: Hex32,
  supportedPairs: z.array(SupportedPair).min(1).max(MAX_SUPPORTED_PAIRS),
  supportedPools: z.array(z.enum(POOL_IDS)).min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
});

export type SolverAdMessageData = z.infer<typeof SolverAdMessageData>;

export const SolverAdMessage = z.object({
  data: SolverAdMessageData,
  signature: Hex64,
});

export type SolverAdMessage = z.infer<typeof SolverAdMessage>;

/**
 * Decodes a solver availability ad from its wire JSON.
 *
 * @param text Raw payload from the solvers content topic.
 * @param opts When `now` is given, expired ads are rejected; when `chain` is
 *   given, ads scoped to another chain are rejected.
 */
export function decodeSolverAdMessage(
  text: string,
  opts: DecodeOpts = {},
): Result<SolverAdMessage> {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const parsed = runSchema(SolverAdMessage, json.value);
  if (!parsed.ok) {
    return parsed;
  }
  const expired = checkExpiry<SolverAdMessage>('expiry', parsed.value.data.expiry, opts.now);
  if (expired !== undefined) {
    return expired;
  }
  if (opts.chain !== undefined && !chainEquals(parsed.value.data.chain, opts.chain)) {
    return err({ kind: 'chain-mismatch', expected: opts.chain, received: parsed.value.data.chain });
  }
  return parsed;
}
