import { describe, expect, test } from 'vitest';
import { decodeQuoteEnvelope, decodeQuoteMessageData } from './index.js';
import {
  loadFixture,
  unwrap,
  unwrapErr,
  type DataFixture,
  type MessageFixture,
} from './tests/helpers.js';

const envelopeFixture = loadFixture<MessageFixture>('quote-envelope');
const dataFixture = loadFixture<DataFixture>('quote-data');

describe('decodeQuoteEnvelope', () => {
  test('decodes the golden envelope fixture', () => {
    const text = JSON.stringify(envelopeFixture.message);
    expect(unwrap(decodeQuoteEnvelope(text))).toEqual(envelopeFixture.message);
  });

  test('rejects malformed JSON', () => {
    expect(unwrapErr(decodeQuoteEnvelope('nope')).kind).toBe('malformed-json');
  });

  test('rejects encryptedData without the 0x prefix', () => {
    const message = structuredClone(envelopeFixture.message) as { encryptedData: string[] };
    const ivTag = message.encryptedData[0];
    if (ivTag === undefined) throw new Error('fixture missing ivTag');
    message.encryptedData[0] = ivTag.slice(2);
    expect(unwrapErr(decodeQuoteEnvelope(JSON.stringify(message))).kind).toBe('schema');
  });

  test('rejects encryptedData that is not a two-element tuple', () => {
    const message = structuredClone(envelopeFixture.message) as { encryptedData: string[] };
    message.encryptedData = [message.encryptedData[0] ?? ''];
    expect(unwrapErr(decodeQuoteEnvelope(JSON.stringify(message))).kind).toBe('schema');
  });

  test('rejects a pubkey of the wrong length', () => {
    const message = structuredClone(envelopeFixture.message) as { pubkey: string };
    message.pubkey = message.pubkey.slice(0, 62);
    expect(unwrapErr(decodeQuoteEnvelope(JSON.stringify(message))).kind).toBe('schema');
  });
});

describe('decodeQuoteMessageData', () => {
  const mutated = (mutate: (d: Record<string, unknown>) => void): Record<string, unknown> => {
    const data = structuredClone(dataFixture.data);
    mutate(data);
    return data;
  };

  test('decodes the golden plaintext fixture', () => {
    expect(unwrap(decodeQuoteMessageData(dataFixture.data))).toEqual(dataFixture.data);
  });

  test('rejects a zero buyAmount', () => {
    const data = mutated((d) => {
      d['buyAmount'] = '0x0';
    });
    expect(unwrapErr(decodeQuoteMessageData(data)).kind).toBe('out-of-range');
  });

  test('rejects a buyAmount with leading zero bytes', () => {
    const data = mutated((d) => {
      d['buyAmount'] = '0x00b2d05e00';
    });
    expect(unwrapErr(decodeQuoteMessageData(data)).kind).toBe('schema');
  });

  test('rejects a float validUntil', () => {
    const data = mutated((d) => {
      d['validUntil'] = 1.5;
    });
    expect(unwrapErr(decodeQuoteMessageData(data)).kind).toBe('schema');
  });

  test('rejects an intentId of the wrong length', () => {
    const data = mutated((d) => {
      d['intentId'] = '1234';
    });
    expect(unwrapErr(decodeQuoteMessageData(data)).kind).toBe('schema');
  });

  test('rejects an expired quote when now is provided', () => {
    const validUntil = dataFixture.data['validUntil'] as number;
    const error = unwrapErr(decodeQuoteMessageData(dataFixture.data, { now: validUntil + 1 }));
    expect(error.kind).toBe('expired');
  });
});
