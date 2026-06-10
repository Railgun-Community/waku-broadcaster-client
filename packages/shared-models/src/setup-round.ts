import { z } from 'zod';
import { parseJson, runSchema } from './codec.js';
import { MAX_SESSION_ROUNDS } from './constants.js';
import { type Result } from './errors.js';
import { Hex16, HexPrefixed } from './scalars.js';

/**
 * Encrypted setup-round envelope. Deliberately carries no intentId: the
 * setup channel must not be publicly linkable to the intent (spec Q1.5).
 * The AES-GCM nonce is derived from (round, direction, counter); no IV
 * travels on the wire. Round plaintext bodies are specified in Phase 7.
 */
export const SetupRoundMessage = z.object({
  ciphertext: HexPrefixed,
  counter: z
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1),
  direction: z.union([z.literal(0), z.literal(1)]),
  pairId: Hex16,
  round: z.number().int().min(1).max(MAX_SESSION_ROUNDS),
});

export type SetupRoundMessage = z.infer<typeof SetupRoundMessage>;

/** Decodes a setup-round envelope from its wire JSON. */
export function decodeSetupRoundMessage(text: string): Result<SetupRoundMessage> {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  return runSchema(SetupRoundMessage, json.value);
}
