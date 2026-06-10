import { publicKeyEd25519, signEd25519 } from '../util/ed25519.js';
import { bytesToHex } from '../util/hex.js';

/** Thrown when a disposed identity is used; key material is already zeroed. */
export class IdentityDisposedError extends Error {
  override readonly name = 'IdentityDisposedError';
}

export interface IntentIdentity {
  publicKeyHex(): string;
  /** Signs with the ephemeral key (RFC 8032 deterministic), hex output. */
  sign(bytes: Uint8Array): Promise<string>;
  /**
   * The live 32-byte secret buffer (the ECIES DH input for quote decryption).
   * Deliberately a method returning the live buffer: disposal zeroing is
   * observable, and the secret never sits on an enumerable property.
   */
  dhSecret(): Uint8Array;
  /** Zeroes the secret (best effort under JS GC) and kills every method. */
  dispose(): void;
}

/**
 * One fresh ed25519 keypair per intent, memory-only, never persisted
 * (Q5.1: a lost intent is re-issued, never resumed). The same factory backs
 * other ephemeral roles (setup keys) in later phases.
 *
 * @param opts.entropy Injected entropy source; production passes CSPRNG
 *   bytes, tests pass seeded buffers.
 */
export async function createIntentIdentity(opts: {
  entropy: (n: number) => Uint8Array;
}): Promise<IntentIdentity> {
  const secretKey = opts.entropy(32);
  const pubHex = bytesToHex(publicKeyEd25519(secretKey));
  let disposed = false;
  const guard = (): void => {
    if (disposed) {
      throw new IdentityDisposedError('ephemeral intent identity already disposed');
    }
  };
  return {
    publicKeyHex: () => {
      guard();
      return pubHex;
    },
    sign: (bytes) => {
      guard();
      return Promise.resolve(bytesToHex(signEd25519(bytes, secretKey)));
    },
    dhSecret: () => {
      guard();
      return secretKey;
    },
    dispose: () => {
      disposed = true;
      secretKey.fill(0);
    },
  };
}
