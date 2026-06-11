import { describe, expect, test } from 'vitest';
import { bytesToHex } from '../util/hex.js';
import { decryptQuoteEnvelope, deriveQuoteSharedKey, encryptQuoteData } from './quote-decrypt.js';
import { fixedEntropy, hexToBytes, loadEciesFixture, quoteVariant } from './tests/helpers.js';

const fixture = loadEciesFixture();
const recipientSk = hexToBytes(fixture.recipientSk);

describe('deriveQuoteSharedKey', () => {
  test('matches the Railgun engine interop fixture byte-for-byte', () => {
    const shared = deriveQuoteSharedKey(recipientSk, fixture.envelope.pubkey);
    expect(bytesToHex(shared)).toBe(fixture.sharedKey);
  });

  test('is symmetric between the two sides', () => {
    const ephSk = hexToBytes(fixture.ephemeralSk);
    const senderSide = deriveQuoteSharedKey(ephSk, fixture.recipientPub);
    expect(bytesToHex(senderSide)).toBe(fixture.sharedKey);
  });
});

describe('decryptQuoteEnvelope', () => {
  test('opens the engine-generated envelope (cross-implementation contract)', () => {
    const result = decryptQuoteEnvelope(fixture.envelope, recipientSk);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(fixture.plaintext);
    }
  });

  test('a flipped ciphertext byte fails AEAD as not-for-us', () => {
    const tampered = structuredClone(fixture.envelope);
    const body = tampered.encryptedData[1];
    tampered.encryptedData[1] = `${body.slice(0, -2)}${body.endsWith('00') ? '01' : '00'}`;
    const result = decryptQuoteEnvelope(tampered, recipientSk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-for-us');
    }
  });

  test('the wrong recipient key fails as not-for-us', () => {
    const wrongSk = new Uint8Array(32).fill(9);
    const result = decryptQuoteEnvelope(fixture.envelope, wrongSk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-for-us');
    }
  });

  test('a decrypted body that fails the quote schema reports the model error', () => {
    const envelope = encryptQuoteData(
      quoteVariant(fixture.plaintext, { reliability: 10001 }),
      fixture.recipientPub,
      { entropy: fixedEntropy(0x42), skipValidation: true },
    );
    const result = decryptQuoteEnvelope(envelope, recipientSk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('out-of-range');
    }
  });

  test('expired quotes are rejected when now is provided', () => {
    const result = decryptQuoteEnvelope(fixture.envelope, recipientSk, {
      now: fixture.plaintext.validUntil + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('expired');
    }
  });
});

describe('encryptQuoteData', () => {
  test('round-trips through decryptQuoteEnvelope', () => {
    const envelope = encryptQuoteData(fixture.plaintext, fixture.recipientPub, {
      entropy: fixedEntropy(0x55),
    });
    const result = decryptQuoteEnvelope(envelope, recipientSk);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(fixture.plaintext);
    }
  });

  test('produces the Railgun wire shape: 0x ivTag (32 bytes) and 0x ciphertext', () => {
    const envelope = encryptQuoteData(fixture.plaintext, fixture.recipientPub, {
      entropy: fixedEntropy(0x55),
    });
    expect(envelope.pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(envelope.encryptedData[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(envelope.encryptedData[1]).toMatch(/^0x([0-9a-f]{2})+$/);
  });

  test('rejects invalid quote data before encrypting', () => {
    expect(() =>
      encryptQuoteData(
        quoteVariant(fixture.plaintext, { buyAmount: '0x0' }),
        fixture.recipientPub,
        {
          entropy: fixedEntropy(0x55),
        },
      ),
    ).toThrow();
  });
});
