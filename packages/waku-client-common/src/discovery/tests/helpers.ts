import { readFileSync } from 'node:fs';
import type { SolverAdMessageData } from '@zeno/shared-models';

export interface SolverAdFixture {
  privateKey: string;
  publicKey: string;
  data: SolverAdMessageData;
  canonical: string;
  signature: string;
  message: { data: SolverAdMessageData; signature: string };
}

export function loadSolverAdFixture(): SolverAdFixture {
  const url = new URL(
    '../../../../shared-models/src/tests/fixtures/solver-ad.json',
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8')) as SolverAdFixture;
}

/** Fixed reference clock matching the fixture generator. */
export const FIXTURE_NOW = 1_781_100_000_000;

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Builds a variant of the fixture ad data (caller re-signs if needed). */
export function adVariant(
  fixture: SolverAdFixture,
  overrides: Partial<SolverAdMessageData>,
): SolverAdMessageData {
  return { ...structuredClone(fixture.data), ...overrides };
}
