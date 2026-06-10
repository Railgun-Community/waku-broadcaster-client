import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Wire pure-JS SHA-512 into noble's hash registry: makes signing and
// verification synchronous-resolving (microtasks only, no webcrypto), which
// keeps the library deterministic under fake timers and free of a
// crypto.subtle dependency in web bundles.
ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = (msg: Uint8Array) => Promise.resolve(sha512(msg));

/** Verifies an ed25519 signature; malformed inputs return false, never throw. */
export function verifyEd25519(sig: Uint8Array, msg: Uint8Array, pubkey: Uint8Array): boolean {
  try {
    return ed.verify(sig, msg, pubkey);
  } catch {
    return false;
  }
}

/** Signs with ed25519 (RFC 8032 deterministic). */
export function signEd25519(msg: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed.sign(msg, secretKey);
}

/** Derives the ed25519 public key for a 32-byte secret. */
export function publicKeyEd25519(secretKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(secretKey);
}
