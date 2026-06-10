import { readFileSync } from 'node:fs';
import type { Result, ZenoModelError } from '../errors.js';

export interface SignedFixture {
  privateKey: string;
  publicKey: string;
  data: Record<string, unknown>;
  canonical: string;
  signature: string;
  message: { data: Record<string, unknown>; signature: string };
}

export interface DataFixture {
  data: Record<string, unknown>;
}

export interface MessageFixture {
  message: Record<string, unknown>;
}

export function loadFixture<T>(name: string): T {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

export function unwrapErr<T>(result: Result<T>): ZenoModelError {
  if (result.ok) {
    throw new Error('expected error, got ok');
  }
  return result.error;
}

/** Rebuilds an object (recursively) with reversed key insertion order. */
export function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseKeyOrder);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).toReversed();
    return Object.fromEntries(entries.map(([k, v]) => [k, reverseKeyOrder(v)]));
  }
  return value;
}
