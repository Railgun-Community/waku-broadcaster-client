import type { ChainRef } from './scalars.js';

/**
 * Validation failure surfaced by every decode helper in this package.
 *
 * Signature verification is deliberately absent: shared-models has no crypto.
 * Verifiers in the transport layer wrap this union with their own error kinds.
 */
export type ZenoModelError =
  | { kind: 'malformed-json'; detail: string }
  | { kind: 'schema'; path: string; expected: string; received: string }
  | { kind: 'out-of-range'; path: string; constraint: string }
  | { kind: 'expired'; field: 'expiry' | 'validUntil' | 'deadline'; value: number; now: number }
  | { kind: 'chain-mismatch'; expected: ChainRef; received: ChainRef }
  | { kind: 'non-canonical-number'; path: string };

/** Decode outcome: untrusted input never throws, it returns this. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ZenoModelError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T>(error: ZenoModelError): Result<T> => ({ ok: false, error });

/** Thrown by {@link canonicalize} on programmer error (invalid value to encode). */
export class ZenoCanonicalizeError extends Error {
  override readonly name = 'ZenoCanonicalizeError';
}
