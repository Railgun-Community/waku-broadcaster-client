/**
 * HKDF-SHA256 derivations and the dev-known committee simulation backing the
 * unsafe stub backend.
 *
 * Everything here is deterministic and developer-known by design: anyone with
 * the public inputs can derive every secret. This file simulates workflows,
 * not security properties (spec 02 section 2).
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { EscrowAccount, PubShare, SweCiphertext } from '../backend.js';

const SHARE_INFO = 'zeno-v0-stub-share';
const PUB_INFO = 'zeno-v0-stub-pub';
const ESCROW_INFO = 'zeno-v0-stub-escrow';
const SWE_KEY_INFO = 'zeno-v0-stub-swe-key';
const COMMITTEE_INFO = 'zeno-v0-stub-committee-secret';
const MESSAGE_ID_TAG = 'zeno-v0-stub-swe-message-id';

const KEY_LENGTH = 32;

/** Encodes parts unambiguously: 4-byte big-endian length prefix per part. */
export function lengthPrefixedConcat(parts: Uint8Array[]): Uint8Array {
  const prefixed: Uint8Array[] = [];
  for (const part of parts) {
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, part.length);
    prefixed.push(prefix, part);
  }
  return concatBytes(...prefixed);
}

/** `sha256` over a domain-separation tag and length-prefixed parts. */
export function taggedHash(tag: string, ...parts: Uint8Array[]): Uint8Array {
  return sha256(lengthPrefixedConcat([utf8ToBytes(tag), ...parts]));
}

/** Derives the secret half of a key share from injected seed entropy. */
export function deriveSecretShare(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, utf8ToBytes(SHARE_INFO), KEY_LENGTH);
}

/** Derives the public half of a key share from its secret. */
export function derivePubShare(secret: Uint8Array): PubShare {
  return hkdf(sha256, secret, undefined, utf8ToBytes(PUB_INFO), KEY_LENGTH);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return a.length - b.length;
}

/**
 * Derives the full escrow account from the two public shares.
 *
 * The shares are sorted lexicographically so both parties derive the same
 * seed regardless of which side they sit on. This uses PUBLIC material only:
 * anyone observing the setup session can derive the escrow keys. That is the
 * point of the stub (developer-known keys); the real backend derives a
 * jointly-controlled escrow whose spend key neither party - and certainly no
 * observer - holds. Do not reuse this construction outside the stub.
 *
 * The deposit address is the placeholder form
 * `zeno-stub:<first 32 hex chars of sha256(keyTuple canonical concat)>`;
 * real Railgun 0zk derivation happens in the Phase 11 wallet integration.
 */
export function deriveStubEscrowAccount(localPub: PubShare, remotePub: PubShare): EscrowAccount {
  const [low, high] =
    compareBytes(localPub, remotePub) <= 0 ? [localPub, remotePub] : [remotePub, localPub];
  const escrowSeed = sha256(concatBytes(low, high));
  const keyOf = (part: string): string =>
    bytesToHex(
      hkdf(sha256, escrowSeed, undefined, utf8ToBytes(`${ESCROW_INFO}:${part}`), KEY_LENGTH),
    );
  const keyTuple = {
    spendingKey: keyOf('spending'),
    nullifyingKey: keyOf('nullifying'),
    viewingKey: keyOf('viewing'),
  };
  const canonical = utf8ToBytes(
    `${keyTuple.spendingKey}${keyTuple.nullifyingKey}${keyTuple.viewingKey}`,
  );
  const depositAddress = `zeno-stub:${bytesToHex(sha256(canonical)).slice(0, 32)}`;
  const viewKey = hkdf(
    sha256,
    escrowSeed,
    undefined,
    utf8ToBytes(`${ESCROW_INFO}:viewing`),
    KEY_LENGTH,
  );
  return { keyTuple, depositAddress, viewKey };
}

/** Derives the AES-256-GCM key for the SWE simulation from public inputs. */
export function deriveSweKey(threshold: number, committee: Uint8Array[]): Uint8Array {
  const thresholdBytes = new Uint8Array(4);
  new DataView(thresholdBytes.buffer).setUint32(0, threshold);
  const ikm = lengthPrefixedConcat([thresholdBytes, ...committee]);
  return hkdf(sha256, ikm, undefined, utf8ToBytes(SWE_KEY_INFO), KEY_LENGTH);
}

/** The message id committee members "sign" to release a SWE ciphertext. */
export function sweMessageId(ct: SweCiphertext): Uint8Array {
  return taggedHash(MESSAGE_ID_TAG, ct.ciphertext);
}

/** Dev-known secret of a simulated committee member, derived from its public id. */
export function committeeMemberSecret(member: Uint8Array): Uint8Array {
  return hkdf(sha256, member, undefined, utf8ToBytes(COMMITTEE_INFO), KEY_LENGTH);
}

/**
 * Simulated oblivious-signer signature: `HMAC-SHA256(devSecret_i, messageId)`.
 *
 * Test harnesses call this to play the committee; there is no signer
 * infrastructure in stub mode (spec 02, Q2.3). `Unsafe` because the signing
 * secret is derivable by anyone from the member's public id.
 */
export function unsafeStubCommitteeSign(member: Uint8Array, ct: SweCiphertext): Uint8Array {
  return hmac(sha256, committeeMemberSecret(member), sweMessageId(ct));
}
