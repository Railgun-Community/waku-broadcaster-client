import * as ed from '@noble/ed25519';
import { describe, expect, test } from 'vitest';
import { canonicalize, decodeIntentMessage, encodeMessage } from './index.js';
import { loadFixture, unwrap, unwrapErr, type SignedFixture } from './tests/helpers.js';

const fixture = loadFixture<SignedFixture>('intent');
const wireText = (): string => JSON.stringify(fixture.message);

const mutated = (mutate: (data: Record<string, unknown>) => void): string => {
  const message = structuredClone(fixture.message);
  mutate(message.data);
  return JSON.stringify(message);
};

describe('decodeIntentMessage', () => {
  test('decodes the golden fixture', () => {
    expect(unwrap(decodeIntentMessage(wireText()))).toEqual(fixture.message);
  });

  test('round-trips through encodeMessage', () => {
    const message = unwrap(decodeIntentMessage(wireText()));
    expect(unwrap(decodeIntentMessage(encodeMessage(message)))).toEqual(message);
  });

  test('golden signature verifies over the canonical bytes (fixture integrity)', async () => {
    const valid = await ed.verifyAsync(
      Buffer.from(fixture.signature, 'hex'),
      Buffer.from(canonicalize(fixture.data), 'utf8'),
      Buffer.from(fixture.publicKey, 'hex'),
    );
    expect(valid).toBe(true);
  });

  test('rejects an intentId that is not 16 bytes', () => {
    const text = mutated((d) => {
      d['intentId'] = 'aabb';
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('schema');
  });

  test('rejects sellToken equal to buyToken', () => {
    const text = mutated((d) => {
      d['buyToken'] = d['sellToken'];
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('schema');
  });

  test('rejects a zero sellAmount', () => {
    const text = mutated((d) => {
      d['sellAmount'] = '0x0';
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('out-of-range');
  });

  test('rejects a sellAmount with leading zero bytes', () => {
    const text = mutated((d) => {
      d['sellAmount'] = '0x00de0b6b3a7640000';
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('schema');
  });

  test('rejects a deadline at or before expiry', () => {
    const text = mutated((d) => {
      d['deadline'] = d['expiry'];
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('out-of-range');
  });

  test('rejects an unknown pool id in allowedPools', () => {
    const text = mutated((d) => {
      d['allowedPools'] = ['unknown-pool'];
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('schema');
  });

  test('rejects missing escrowParams', () => {
    const text = mutated((d) => delete d['escrowParams']);
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('schema');
  });

  test('rejects an escrow threshold above the committee size', () => {
    const text = mutated((d) => {
      (d['escrowParams'] as { threshold: number }).threshold = 4;
    });
    expect(unwrapErr(decodeIntentMessage(text)).kind).toBe('out-of-range');
  });

  test('rejects an expired intent when now is provided', () => {
    const expiry = fixture.data['expiry'] as number;
    expect(unwrapErr(decodeIntentMessage(wireText(), { now: expiry + 1 })).kind).toBe('expired');
  });
});
