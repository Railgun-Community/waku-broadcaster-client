/**
 * Developer-known stub implementation of {@link ZenoCryptoBackend}.
 *
 * Simulates the deterministic key-generation workflow only - NOT the security
 * properties (spec 02 section 2). Escrow keys derive from public material,
 * committee signatures are HMACs under derivable secrets, and proofs are
 * tagged hashes of their public inputs. Nothing is zero-knowledge, nothing is
 * sound, and every secret is recoverable by anyone observing the session.
 *
 * Approved deviation from spec 02 section 5: `stub/railgun-keys.ts` called
 * for real Railgun address derivation via `@railgun-community/engine`, but
 * that package was removed from the workspace in Phase 3 (vulnerable web3 1.x
 * tree). The stub instead exposes the HKDF-derived `(sk, nk, vk)` tuple and a
 * `zeno-stub:<hex>` placeholder deposit address; real Railgun 0zk address
 * derivation moves to the Phase 11 wallet integration where the engine lives.
 *
 * AES-256-GCM comes from `node:crypto` (synchronous, no extra dependency);
 * WebCrypto's `subtle` API is async and cannot back the synchronous
 * interface. The stub is therefore Node-only, which matches its dev/test
 * scope.
 */
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import {
  ZenoCryptoError,
  type DleqStatement,
  type EscrowAccount,
  type KeyShare,
  type PoolId,
  type PubShare,
  type SweCiphertext,
  type ZenoCryptoBackend,
} from '../backend.js';
import {
  deriveStubEscrowAccount,
  derivePubShare,
  deriveSecretShare,
  deriveSweKey,
  lengthPrefixedConcat,
  sweMessageId,
  taggedHash,
  unsafeStubCommitteeSign,
} from './derive.js';

/** Options for {@link createUnsafeStubBackend}; the flag name is the consent. */
export interface UnsafeStubBackendOptions {
  unsafeStubCrypto: true;
  chain: { id: number; type: number };
  logger: { warn(msg: string): void };
}

const MAINNET_CHAIN_IDS = new Set([1, 10, 56, 137, 8453, 42161]);

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

const SWE_WF_TAG = 'zeno-v0-stub-swe-wf';
const DLEQ_TAG = 'zeno-v0-stub-dleq';
const PEDERSEN_TAG = 'zeno-v0-stub-pedersen';

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function assertOptions(options: UnsafeStubBackendOptions): void {
  if ((options.unsafeStubCrypto as boolean) !== true) {
    throw new ZenoCryptoError(
      'unsafe-flag-missing',
      'the stub backend requires { unsafeStubCrypto: true }: its keys are developer-known',
    );
  }
  if (MAINNET_CHAIN_IDS.has(options.chain.id)) {
    throw new ZenoCryptoError(
      'mainnet-chain',
      `chain id ${options.chain.id} is a known mainnet; the stub backend never runs against mainnets`,
    );
  }
}

function sweEncryptStub(
  message: Uint8Array,
  threshold: number,
  committee: Uint8Array[],
): SweCiphertext {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > committee.length) {
    throw new ZenoCryptoError(
      'invalid-input',
      `threshold ${threshold} must be an integer in [1, committee size ${committee.length}]`,
    );
  }
  const key = deriveSweKey(threshold, committee);
  const iv = hmac(sha256, key, message).slice(0, GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = cipher.update(message);
  cipher.final();
  const ciphertext = concatBytes(iv, new Uint8Array(body), new Uint8Array(cipher.getAuthTag()));
  return { ciphertext, threshold, committee: committee.map((member) => member.slice()) };
}

function countValidSignatures(ct: SweCiphertext, signatures: Uint8Array[]): number {
  const expected = new Set(
    ct.committee.map((member) => bytesToHex(unsafeStubCommitteeSign(member, ct))),
  );
  const provided = new Set(signatures.map((signature) => bytesToHex(signature)));
  let valid = 0;
  for (const tag of provided) {
    if (expected.has(tag)) {
      valid += 1;
    }
  }
  return valid;
}

function sweDecryptStub(ct: SweCiphertext, signatures: Uint8Array[]): Uint8Array {
  if (ct.ciphertext.length < GCM_IV_LENGTH + GCM_TAG_LENGTH) {
    throw new ZenoCryptoError(
      'invalid-input',
      `ciphertext of ${ct.ciphertext.length} bytes is shorter than iv plus auth tag`,
    );
  }
  const valid = countValidSignatures(ct, signatures);
  if (valid < ct.threshold) {
    throw new ZenoCryptoError(
      'swe-threshold',
      `${valid} valid committee signatures, threshold is ${ct.threshold}`,
    );
  }
  const key = deriveSweKey(ct.threshold, ct.committee);
  const iv = ct.ciphertext.slice(0, GCM_IV_LENGTH);
  const body = ct.ciphertext.slice(GCM_IV_LENGTH, ct.ciphertext.length - GCM_TAG_LENGTH);
  const tag = ct.ciphertext.slice(ct.ciphertext.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = decipher.update(body);
    decipher.final();
    return new Uint8Array(plaintext);
  } catch {
    throw new ZenoCryptoError(
      'swe-decrypt-failed',
      'AES-GCM authentication failed: the ciphertext was tampered with',
    );
  }
}

function encodeCiphertext(ct: SweCiphertext): Uint8Array {
  const thresholdBytes = new Uint8Array(4);
  new DataView(thresholdBytes.buffer).setUint32(0, ct.threshold);
  return lengthPrefixedConcat([thresholdBytes, ...ct.committee, ct.ciphertext]);
}

/**
 * Constructs the unsafe stub backend.
 *
 * Safety rails (spec 02 section 2, non-negotiable): throws unless
 * `unsafeStubCrypto === true`, throws for known mainnet chain ids
 * (1, 10, 56, 137, 8453, 42161), and emits exactly one warning through the
 * injected logger per construction.
 *
 * Proof stubs hash only the inputs the matching `verify*` call also receives
 * (`verify*` recomputes and compares), so DLEQ witnesses and Pedersen
 * openings do not influence the placeholder proof bytes. Well-formedness
 * proving does bind the message: stub encryption is deterministic, so
 * `sweProveWellFormedness` re-encrypts and throws on a mismatch.
 */
export function createUnsafeStubBackend(options: UnsafeStubBackendOptions): ZenoCryptoBackend {
  assertOptions(options);
  options.logger.warn(
    'zeno crypto STUB backend in use: keys are developer-known, nothing is ' +
      'zero-knowledge, nothing is sound. Dev and test only - never fund real value.',
  );
  return {
    generateKeyShare(_pool: PoolId, seed: Uint8Array): KeyShare {
      const secret = deriveSecretShare(seed);
      return { secret, pub: derivePubShare(secret) };
    },
    deriveEscrowAccount(_pool: PoolId, local: KeyShare, remotePub: PubShare): EscrowAccount {
      return deriveStubEscrowAccount(local.pub, remotePub);
    },
    sweEncrypt: sweEncryptStub,
    sweDecrypt: sweDecryptStub,
    sweProveWellFormedness(ct: SweCiphertext, message: Uint8Array): Uint8Array {
      const reEncrypted = sweEncryptStub(message, ct.threshold, ct.committee);
      if (!bytesEqual(reEncrypted.ciphertext, ct.ciphertext)) {
        throw new ZenoCryptoError(
          'invalid-input',
          'message does not match the ciphertext: cannot prove well-formedness',
        );
      }
      return taggedHash(SWE_WF_TAG, encodeCiphertext(ct));
    },
    sweVerifyWellFormedness(ct: SweCiphertext, proof: Uint8Array): boolean {
      return bytesEqual(proof, taggedHash(SWE_WF_TAG, encodeCiphertext(ct)));
    },
    proveDleq(_witness: Uint8Array, statement: DleqStatement): Uint8Array {
      return taggedHash(DLEQ_TAG, statement.left, statement.right);
    },
    verifyDleq(proof: Uint8Array, statement: DleqStatement): boolean {
      return bytesEqual(proof, taggedHash(DLEQ_TAG, statement.left, statement.right));
    },
    provePedersenOpening(
      commitment: Uint8Array,
      _opening: Uint8Array,
      keyShare: PubShare,
    ): Uint8Array {
      return taggedHash(PEDERSEN_TAG, commitment, keyShare);
    },
    verifyPedersenOpening(commitment: Uint8Array, proof: Uint8Array, keyShare: PubShare): boolean {
      return bytesEqual(proof, taggedHash(PEDERSEN_TAG, commitment, keyShare));
    },
    backendKind(): 'stub-unsafe' {
      return 'stub-unsafe';
    },
  };
}

export { sweMessageId };
