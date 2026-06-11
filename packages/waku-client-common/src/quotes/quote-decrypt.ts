import { gcm } from '@noble/ciphers/aes.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  decodeQuoteMessageData,
  QuoteMessageData,
  type EciesEnvelope,
  type ZenoModelError,
} from '@zeno/shared-models';
import { bytesToHex, hexToBytes, utf8Decode, utf8Encode } from '../util/hex.js';

export type QuoteDecryptError = ZenoModelError | { kind: 'not-for-us' };

export type QuoteDecryptResult =
  | { ok: true; value: QuoteMessageData }
  | { ok: false; error: QuoteDecryptError };

const P = 2n ** 255n - 19n;
const mod = (a: bigint): bigint => ((a % P) + P) % P;

function invert(a: bigint): bigint {
  let result = 1n;
  let base = mod(a);
  let exp = P - 2n;
  while (exp > 0n) {
    if (exp & 1n) {
      result = mod(result * base);
    }
    base = mod(base * base);
    exp >>= 1n;
  }
  return result;
}

/** ed25519 public key (Edwards y) to X25519 (Montgomery u): u = (1+y)/(1-y). */
function edPubToX25519(pubkey: Uint8Array): Uint8Array {
  const { y } = ed25519.Point.fromBytes(pubkey).toAffine();
  let u = mod((1n + y) * invert(1n - y));
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number(u & 0xffn);
    u >>= 8n;
  }
  return out;
}

/** ed25519 secret to clamped X25519 scalar (RFC 8032 expansion head). */
function edSkToX25519(secretKey: Uint8Array): Uint8Array {
  const head = sha512(secretKey).slice(0, 32);
  const first = head[0] ?? 0;
  const last = head[31] ?? 0;
  head[0] = first & 248;
  head[31] = (last & 127) | 64;
  return head;
}

/**
 * The Railgun ECIES shared key: both keys are ed25519, converted to X25519,
 * raw DH output used directly as the AES key (no KDF). Verified byte-for-byte
 * against `@railgun-community/engine` (the ecies-interop golden fixture).
 */
export function deriveQuoteSharedKey(localEdSk: Uint8Array, remoteEdPubHex: string): Uint8Array {
  return x25519.scalarMult(edSkToX25519(localEdSk), edPubToX25519(hexToBytes(remoteEdPubHex)));
}

const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function openEnvelope(envelope: EciesEnvelope, sharedKey: Uint8Array): Uint8Array | undefined {
  try {
    const ivTag = hexToBytes(envelope.encryptedData[0].slice(2));
    const body = hexToBytes(envelope.encryptedData[1].slice(2));
    const iv = ivTag.subarray(0, IV_LENGTH);
    const tag = ivTag.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const sealed = new Uint8Array(body.length + TAG_LENGTH);
    sealed.set(body);
    sealed.set(tag, body.length);
    return gcm(sharedKey, iv).decrypt(sealed);
  } catch {
    return undefined;
  }
}

/**
 * Decrypts a quote envelope against the intent's ephemeral secret and
 * validates the plaintext. AEAD failure means the quote was not addressed to
 * this key (`not-for-us`) - the standard trial-decrypt sieve outcome.
 */
export function decryptQuoteEnvelope(
  envelope: EciesEnvelope,
  recipientEdSk: Uint8Array,
  opts: { now?: number } = {},
): QuoteDecryptResult {
  const sharedKey = deriveQuoteSharedKey(recipientEdSk, envelope.pubkey);
  const plaintext = openEnvelope(envelope, sharedKey);
  if (plaintext === undefined) {
    return { ok: false, error: { kind: 'not-for-us' } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(plaintext));
  } catch {
    return { ok: false, error: { kind: 'malformed-json', detail: 'quote body' } };
  }
  return decodeQuoteMessageData(parsed, opts.now === undefined ? {} : { now: opts.now });
}

/**
 * Encrypts a quote body to a recipient ed25519 pubkey (solver side and
 * tests). Produces the exact Railgun wire shape: fresh ephemeral ed25519 key,
 * `[0x iv||tag, 0x ciphertext]`.
 *
 * @throws Error on schema-invalid data unless `skipValidation` (test hook for
 *   producing deliberately invalid ciphertexts).
 */
export function encryptQuoteData(
  data: QuoteMessageData,
  recipientEdPubHex: string,
  opts: { entropy: (n: number) => Uint8Array; skipValidation?: boolean },
): EciesEnvelope {
  if (opts.skipValidation !== true) {
    const checked = QuoteMessageData.safeParse(data);
    if (!checked.success) {
      throw new Error(`invalid quote data: ${checked.error.issues[0]?.message ?? 'schema'}`);
    }
  }
  const ephSk = opts.entropy(32);
  const ephPub = ed25519.getPublicKey(ephSk);
  const sharedKey = deriveQuoteSharedKey(ephSk, recipientEdPubHex);
  const iv = opts.entropy(IV_LENGTH);
  const sealed = gcm(sharedKey, iv).encrypt(utf8Encode(JSON.stringify(data)));
  const body = sealed.subarray(0, sealed.length - TAG_LENGTH);
  const tag = sealed.subarray(sealed.length - TAG_LENGTH);
  return {
    pubkey: bytesToHex(ephPub),
    encryptedData: [`0x${bytesToHex(iv)}${bytesToHex(tag)}`, `0x${bytesToHex(body)}`],
  };
}
