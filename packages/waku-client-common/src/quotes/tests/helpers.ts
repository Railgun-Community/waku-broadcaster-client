import { readFileSync } from 'node:fs';
import type { EciesEnvelope, QuoteMessageData } from '@zeno/shared-models';

export interface EciesInteropFixture {
  recipientSk: string;
  recipientPub: string;
  ephemeralSk: string;
  sharedKey: string;
  envelope: EciesEnvelope;
  plaintext: QuoteMessageData;
}

export function loadEciesFixture(): EciesInteropFixture {
  const url = new URL(
    '../../../../shared-models/src/tests/fixtures/ecies-interop.json',
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, 'utf8')) as EciesInteropFixture;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Deterministic entropy for encrypt-direction tests. */
export const fixedEntropy =
  (fill: number) =>
  (n: number): Uint8Array =>
    new Uint8Array(n).fill(fill);

export function quoteVariant(
  base: QuoteMessageData,
  overrides: Partial<QuoteMessageData>,
): QuoteMessageData {
  return { ...structuredClone(base), ...overrides };
}
