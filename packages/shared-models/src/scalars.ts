import { z } from 'zod';

/** Lowercase hex, no 0x prefix, whole bytes. */
export const Hex = z.string().regex(/^([0-9a-f]{2})+$/, 'lowercase hex, even length, no 0x');

/** 16-byte id (intentId, pairId). */
export const Hex16 = z.string().regex(/^[0-9a-f]{32}$/, '16 bytes of lowercase hex');

/** 32-byte key (ed25519/x25519 public keys). */
export const Hex32 = z.string().regex(/^[0-9a-f]{64}$/, '32 bytes of lowercase hex');

/** 64-byte ed25519 signature. */
export const Hex64 = z.string().regex(/^[0-9a-f]{128}$/, '64 bytes of lowercase hex');

/** 0x-prefixed lowercase hex, whole bytes (Railgun ECIES wire parity). */
export const HexPrefixed = z
  .string()
  .regex(/^0x([0-9a-f]{2})*$/, '0x-prefixed lowercase hex, even length');

/**
 * Canonical 0x-prefixed bigint: no leading zero digits, 0x0 for zero,
 * at most 256 bits.
 */
export const Uint256String = z
  .string()
  .regex(/^0x(0|[1-9a-f][0-9a-f]*)$/, '0x-prefixed canonical hex bigint')
  .refine((s) => s.length <= 2 + 64, { message: 'value exceeds 256 bits' });

/** 0x-prefixed lowercase ERC-20 address (canonical signing form; no checksum case). */
export const Address = z.string().regex(/^0x[0-9a-f]{40}$/, '20-byte lowercase address');

/** Milliseconds since the Unix epoch; integer, below 2^53. */
export const TimestampMs = z
  .number()
  .int('timestamps are integer milliseconds')
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

/** Basis points, 0..10000 inclusive. */
export const Bps = z.number().int().min(0).max(10000);

/** Chain scope, mirroring Railgun's chain object. */
export const ChainRef = z.object({
  id: z.number().int().min(0),
  type: z.number().int().min(0),
});

export type ChainRef = z.infer<typeof ChainRef>;

export const chainEquals = (a: ChainRef, b: ChainRef): boolean =>
  a.id === b.id && a.type === b.type;
