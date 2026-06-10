import type { z } from 'zod';
import { err, ok, ZenoCanonicalizeError, type Result, type ZenoModelError } from './errors.js';

/**
 * Serializes a value to the canonical JSON used for signing: RFC 8785 (JCS)
 * restricted to integer numbers in [0, 2^53).
 *
 * Object keys are sorted by UTF-16 code units (JCS rule, the JS default sort),
 * recursively; arrays keep their order; strings escape exactly like
 * JSON.stringify; no insignificant whitespace.
 *
 * @throws ZenoCanonicalizeError on values outside the canonical subset
 *   (non-integer numbers, negatives, -0, NaN, Infinity, >= 2^53, undefined,
 *   functions, symbols, bigints). Inputs are our own outbound data, so a
 *   violation is programmer error, not a decode failure.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Object.is(value, -0) || value < 0 || value >= 2 ** 53) {
      throw new ZenoCanonicalizeError(`non-canonical number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalize(element)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${members.join(',')}}`;
  }
  throw new ZenoCanonicalizeError(`unsupported type in canonical JSON: ${typeof value}`);
}

/**
 * Serializes a decoded message for transport. Plain JSON; canonical ordering
 * is only required for the bytes being signed, never for the wire envelope.
 */
export function encodeMessage(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJson(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return err({ kind: 'malformed-json', detail });
  }
}

function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.map(String).join('.');
}

function issueToError(issue: z.core.$ZodIssue): ZenoModelError {
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    return { kind: 'out-of-range', path: issuePath(issue), constraint: issue.message };
  }
  if (issue.code === 'custom') {
    const params = (issue.params ?? {}) as { kind?: string };
    if (params.kind === 'out-of-range') {
      return { kind: 'out-of-range', path: issuePath(issue), constraint: issue.message };
    }
  }
  const expected = 'expected' in issue ? String(issue.expected) : issue.message;
  return { kind: 'schema', path: issuePath(issue), expected, received: issue.message };
}

/** Runs a zod schema over an already-parsed value, mapping the first issue. */
export function runSchema<T>(schema: z.ZodType<T>, value: unknown): Result<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return ok(parsed.data);
  }
  const issue = parsed.error.issues[0];
  if (issue === undefined) {
    return err({ kind: 'schema', path: '', expected: 'unknown', received: 'unknown' });
  }
  return err(issueToError(issue));
}

/** Time- and chain-scoped decode options shared by the message decoders. */
export interface DecodeOpts {
  /** Reference clock in ms; when present, expiry fields are enforced. */
  now?: number;
  /** Expected chain; when present, a differing message chain is rejected. */
  chain?: import('./scalars.js').ChainRef;
}

export function checkExpiry<T>(
  field: 'expiry' | 'validUntil',
  value: number,
  now: number | undefined,
): Result<T> | undefined {
  if (now !== undefined && now > value) {
    return err({ kind: 'expired', field, value, now });
  }
  return undefined;
}
