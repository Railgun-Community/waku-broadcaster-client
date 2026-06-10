import * as ed from '@noble/ed25519';
import * as fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { canonicalize, decodeSolverAdMessage, encodeMessage } from './index.js';
import { loadFixture, unwrap, unwrapErr, type SignedFixture } from './tests/helpers.js';

const hexBytes = (n: number): fc.Arbitrary<string> =>
  fc.uint8Array({ minLength: n, maxLength: n }).map((b) => Buffer.from(b).toString('hex'));

const fixture = loadFixture<SignedFixture>('solver-ad');
const wireText = (): string => JSON.stringify(fixture.message);

const mutated = (mutate: (data: Record<string, unknown>) => void): string => {
  const message = structuredClone(fixture.message);
  mutate(message.data);
  return JSON.stringify(message);
};

describe('decodeSolverAdMessage', () => {
  test('decodes the golden fixture', () => {
    const message = unwrap(decodeSolverAdMessage(wireText()));
    expect(message).toEqual(fixture.message);
  });

  test('round-trips through encodeMessage', () => {
    const message = unwrap(decodeSolverAdMessage(wireText()));
    expect(unwrap(decodeSolverAdMessage(encodeMessage(message)))).toEqual(message);
  });

  test('golden signature verifies over the canonical bytes (fixture integrity)', async () => {
    const valid = await ed.verifyAsync(
      Buffer.from(fixture.signature, 'hex'),
      Buffer.from(canonicalize(fixture.data), 'utf8'),
      Buffer.from(fixture.publicKey, 'hex'),
    );
    expect(valid).toBe(true);
  });

  test('rejects malformed JSON', () => {
    expect(unwrapErr(decodeSolverAdMessage('{not json')).kind).toBe('malformed-json');
  });

  test('rejects a missing solverPubkey', () => {
    const text = mutated((d) => delete d['solverPubkey']);
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('schema');
  });

  test('rejects an uppercase-hex solverPubkey', () => {
    const text = mutated((d) => {
      d['solverPubkey'] = (d['solverPubkey'] as string).toUpperCase();
    });
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('schema');
  });

  test('rejects reliability above 10000 bps', () => {
    const text = mutated((d) => {
      d['reliability'] = 10001;
    });
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('out-of-range');
  });

  test('rejects a float expiry', () => {
    const text = mutated((d) => {
      d['expiry'] = 1781100300000.5;
    });
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('schema');
  });

  test('rejects empty supportedPairs', () => {
    const text = mutated((d) => {
      d['supportedPairs'] = [];
    });
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('out-of-range');
  });

  test('rejects a pair whose sellToken equals its buyToken', () => {
    const text = mutated((d) => {
      const pairs = d['supportedPairs'] as { sellToken: string; buyToken: string }[];
      const first = pairs[0];
      if (first === undefined) throw new Error('fixture has no pairs');
      first.buyToken = first.sellToken;
    });
    expect(unwrapErr(decodeSolverAdMessage(text)).kind).toBe('schema');
  });

  test('rejects an expired ad when now is provided', () => {
    const expiry = fixture.data['expiry'] as number;
    const error = unwrapErr(decodeSolverAdMessage(wireText(), { now: expiry + 1 }));
    expect(error.kind).toBe('expired');
  });

  test('accepts a live ad when now is provided', () => {
    const expiry = fixture.data['expiry'] as number;
    expect(decodeSolverAdMessage(wireText(), { now: expiry - 1 }).ok).toBe(true);
  });

  test('rejects a chain mismatch when an expected chain is provided', () => {
    const error = unwrapErr(decodeSolverAdMessage(wireText(), { chain: { id: 137, type: 0 } }));
    expect(error.kind).toBe('chain-mismatch');
  });

  test('decodes any valid generated ad (property round-trip)', () => {
    const address = hexBytes(20).map((h) => `0x${h}`);
    const uint256 = fc.bigInt({ min: 1n, max: 2n ** 256n - 1n }).map((v) => `0x${v.toString(16)}`);
    const pair = fc
      .tuple(address, address, uint256)
      .filter(([sell, buy]) => sell !== buy)
      .map(([sellToken, buyToken, minSellAmount]) => ({ buyToken, minSellAmount, sellToken }));
    const data = fc.record({
      chain: fc.record({
        id: fc.integer({ min: 0, max: 1_000_000 }),
        type: fc.integer({ min: 0, max: 10 }),
      }),
      expiry: fc.integer({ min: 1, max: 2 ** 50 }),
      reliability: fc.integer({ min: 0, max: 10000 }),
      solverPubkey: hexBytes(32),
      supportedPairs: fc.array(pair, { minLength: 1, maxLength: 4 }),
      supportedPools: fc.constant(['railgun-v2']),
      version: fc.constant('0.1.0'),
    });
    fc.assert(
      fc.property(data, hexBytes(64), (d, signature) => {
        const text = JSON.stringify({ data: d, signature });
        const decoded = unwrap(decodeSolverAdMessage(text));
        expect(unwrap(decodeSolverAdMessage(encodeMessage(decoded)))).toEqual(decoded);
      }),
    );
  });
});
