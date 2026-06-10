import { z } from 'zod';
import { checkExpiry, parseJson, runSchema, type DecodeOpts } from './codec.js';
import { type Result } from './errors.js';
import { Bps, Hex16, Hex32, HexPrefixed, TimestampMs, Uint256String } from './scalars.js';

/**
 * The Railgun-compatible ECIES wire envelope: an ephemeral ed25519 pubkey and
 * `[0x ivTag, 0x ciphertext]` (AES-256-GCM, 16-byte IV and tag).
 */
export const EciesEnvelope = z.object({
  encryptedData: z
    .array(HexPrefixed)
    .superRefine((arr, ctx) => {
      if (arr.length !== 2) {
        ctx.addIssue({ code: 'custom', message: 'encryptedData must be [ivTag, ciphertext]' });
      }
    })
    .transform((arr) => arr as [string, string]),
  pubkey: Hex32,
});

export type EciesEnvelope = z.infer<typeof EciesEnvelope>;

/** Decodes the public ECIES envelope of a quote from its wire JSON. */
export function decodeQuoteEnvelope(text: string): Result<EciesEnvelope> {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  return runSchema(EciesEnvelope, json.value);
}

export const QuoteMessageData = z
  .object({
    buyAmount: Uint256String,
    intentId: Hex16,
    reliability: Bps,
    solverPubkey: Hex32,
    solverSetupPubkey: Hex32,
    validUntil: TimestampMs,
  })
  .refine((d) => d.buyAmount !== '0x0', {
    message: 'buyAmount must be positive',
    params: { kind: 'out-of-range' },
    path: ['buyAmount'],
  });

export type QuoteMessageData = z.infer<typeof QuoteMessageData>;

/**
 * Validates a decrypted quote body. Takes an already-parsed value because the
 * AEAD layer (Phase 6) hands over an object, not text.
 *
 * @param value Decrypted JSON value from inside the envelope.
 * @param opts When `now` is given, quotes past `validUntil` are rejected.
 */
export function decodeQuoteMessageData(
  value: unknown,
  opts: DecodeOpts = {},
): Result<QuoteMessageData> {
  const parsed = runSchema(QuoteMessageData, value);
  if (!parsed.ok) {
    return parsed;
  }
  const expired = checkExpiry<QuoteMessageData>('validUntil', parsed.value.validUntil, opts.now);
  if (expired !== undefined) {
    return expired;
  }
  return parsed;
}
