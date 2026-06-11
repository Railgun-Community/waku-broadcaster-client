/**
 * Developer-known stub implementation of {@link ZenoCryptoBackend}.
 *
 * Simulates the deterministic key-generation workflow only - NOT the security
 * properties (spec 02 section 2). Escrow keys derive from public material,
 * the aggregate committee signature is an HMAC under a derivable secret, and
 * proofs are tagged hashes of their public inputs. Nothing is
 * zero-knowledge, nothing is sound, and every secret is recoverable by
 * anyone observing the session.
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
import {
  ZenoCryptoError,
  type DleqStatement,
  type EscrowAccount,
  type KeyShare,
  type PoolId,
  type PubShare,
  type SecureRandom,
  type SweCiphertext,
  type SweContext,
  type SweEncryptResult,
  type ZenoCryptoBackend,
} from '../backend.js';
import {
  deriveStubEscrowAccount,
  derivePubShare,
  deriveSecretShare,
  deriveSweKey,
  encodeSweContext,
  sweMessageId,
  taggedHash,
  unsafeStubAggregateSign,
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
const ENTROPY_LENGTH = 32;

const SWE_PROOF_TAG = 'zeno-v0-stub-swe-proof';
const SWE_COMMITMENT_TAG = 'zeno-v0-stub-swe-commitment';
const DLEQ_TAG = 'zeno-v0-stub-dleq';

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

function sweProof(ct: SweCiphertext, ctx: SweContext, commitment: Uint8Array): Uint8Array {
  return taggedHash(SWE_PROOF_TAG, ct.ciphertext, encodeSweContext(ctx), commitment);
}

function sweEncryptAndProveStub(
  message: Uint8Array,
  ctx: SweContext,
  random: SecureRandom,
): SweEncryptResult {
  if (
    !Number.isInteger(ctx.threshold) ||
    ctx.threshold < 1 ||
    ctx.threshold > ctx.committee.length
  ) {
    throw new ZenoCryptoError(
      'invalid-input',
      `threshold ${ctx.threshold} must be an integer in [1, committee size ${ctx.committee.length}]`,
    );
  }
  const key = deriveSweKey(ctx);
  const iv = random(GCM_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = cipher.update(message);
  cipher.final();
  const ciphertext: SweCiphertext = {
    ciphertext: new Uint8Array([...iv, ...body, ...cipher.getAuthTag()]),
    threshold: ctx.threshold,
    committee: ctx.committee.map((member) => member.slice()),
    chosenText: ctx.chosenText.slice(),
  };
  // Stub Pedersen commitment: a tagged hash of a fresh blinding and the
  // plaintext. The proof binds ciphertext, context, and commitment together;
  // the plaintext relation holds by construction since proving is fused with
  // encryption (the crate's encrypt_and_prove shape).
  const blinding = random(ENTROPY_LENGTH);
  const commitment = taggedHash(SWE_COMMITMENT_TAG, blinding, message);
  return { ciphertext, proof: sweProof(ciphertext, ctx, commitment), commitment };
}

function sweDecryptStub(
  ct: SweCiphertext,
  aggSignature: Uint8Array,
  signers: boolean[],
): Uint8Array {
  if (signers.length !== ct.committee.length) {
    throw new ZenoCryptoError(
      'signer-mask-length-mismatch',
      `signer mask has ${signers.length} entries, committee has ${ct.committee.length}`,
    );
  }
  let signerCount = 0;
  for (const signed of signers) {
    if (signed) {
      signerCount += 1;
    }
  }
  if (signerCount < ct.threshold) {
    throw new ZenoCryptoError(
      'insufficient-signers',
      `${signerCount} signers in the mask, threshold is ${ct.threshold}`,
    );
  }
  if (ct.ciphertext.length < GCM_IV_LENGTH + GCM_TAG_LENGTH) {
    throw new ZenoCryptoError(
      'invalid-input',
      `ciphertext of ${ct.ciphertext.length} bytes is shorter than iv plus auth tag`,
    );
  }
  if (!bytesEqual(aggSignature, unsafeStubAggregateSign(ct, signers))) {
    throw new ZenoCryptoError(
      'no-dlog-exists',
      'the aggregate signature does not authorize this ciphertext for the masked signers',
    );
  }
  const key = deriveSweKey(ct);
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
      'no-dlog-exists',
      'AES-GCM authentication failed: the ciphertext does not decrypt under its context',
    );
  }
}

/**
 * Constructs the unsafe stub backend.
 *
 * Safety rails (spec 02 section 2, non-negotiable): throws unless
 * `unsafeStubCrypto === true`, throws for known mainnet chain ids
 * (1, 10, 56, 137, 8453, 42161), and emits exactly one warning through the
 * injected logger per construction.
 *
 * Proof stubs hash only the inputs the matching `verify` call also receives
 * (`verify` recomputes and compares), so DLEQ witnesses and randomness do
 * not influence the placeholder proof bytes. The SWE proof binds the
 * ciphertext, the encryption context (committee, threshold, chosenText),
 * and the Pedersen-commitment stand-in returned next to it.
 */
export function createUnsafeStubBackend(options: UnsafeStubBackendOptions): ZenoCryptoBackend {
  assertOptions(options);
  options.logger.warn(
    'zeno crypto STUB backend in use: keys are developer-known, nothing is ' +
      'zero-knowledge, nothing is sound. Dev and test only - never fund real value.',
  );
  return {
    generateKeyShare(_pool: PoolId, random: SecureRandom): KeyShare {
      const secret = deriveSecretShare(random(ENTROPY_LENGTH));
      return { secret, pub: derivePubShare(secret) };
    },
    deriveEscrowAccount(_pool: PoolId, local: KeyShare, remotePub: PubShare): EscrowAccount {
      return deriveStubEscrowAccount(local.pub, remotePub);
    },
    sweEncryptAndProve: sweEncryptAndProveStub,
    sweDecrypt: sweDecryptStub,
    sweVerify(
      ct: SweCiphertext,
      proof: Uint8Array,
      ctx: SweContext,
      commitment: Uint8Array,
    ): boolean {
      return bytesEqual(proof, sweProof(ct, ctx, commitment));
    },
    proveDleq(_witness: Uint8Array, statement: DleqStatement, _random: SecureRandom): Uint8Array {
      return taggedHash(DLEQ_TAG, statement.left, statement.right);
    },
    verifyDleq(proof: Uint8Array, statement: DleqStatement): boolean {
      return bytesEqual(proof, taggedHash(DLEQ_TAG, statement.left, statement.right));
    },
    backendKind(): 'stub-unsafe' {
      return 'stub-unsafe';
    },
  };
}

export { sweMessageId };
