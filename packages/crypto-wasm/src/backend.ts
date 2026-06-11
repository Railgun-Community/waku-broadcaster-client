/**
 * `ZenoCryptoBackend`: the stable TS facade over Zeno's escrow cryptography
 * (key sharing, verifiable SWE, DLEQ).
 *
 * Two backends implement this interface: the developer-known stub
 * ({@link ../stub/backend.js}) and the wasm backend backed by the
 * `rust/zeno-crypto` submodule (spec 02 section 4, not yet available).
 * Phases 5-7 program against this interface only; the backend is selected
 * at client construction.
 *
 * Interface revised per Willem's feedback and the verifiable-swe crate API
 * (spec 02-crypto-wasm-revision-willem.md, R2).
 */

// xgdleq surface pending Willem (see specs/02-crypto-wasm-revision-willem.md section 5)

/** Shielded pool identifier. v0 supports only the Railgun v2 pool. */
export type PoolId = 'railgun-v2';

/**
 * `getRandomValues`-style source of secure random bytes, injected into every
 * randomness-consuming backend call. Production callers pass
 * {@link defaultSecureRandom}; tests inject seeded deterministic functions.
 */
export type SecureRandom = (length: number) => Uint8Array;

/** Default {@link SecureRandom} wired to `globalThis.crypto.getRandomValues`. */
export const defaultSecureRandom: SecureRandom = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

/** Public half of a key share, exchanged over the setup session. */
export type PubShare = Uint8Array;

/** One party's contribution to the jointly derived escrow key. */
export interface KeyShare {
  readonly secret: Uint8Array;
  readonly pub: PubShare;
}

/**
 * Escrow account both parties recompute independently and must match (Q7.3).
 *
 * `keyTuple` mirrors Railgun's `(sk, nk, vk)` structure as lowercase hex
 * strings. `depositAddress` is the address the sender funds inside the pool;
 * in the stub it is a `zeno-stub:` placeholder, in the wasm-era wallet
 * integration (Phase 11) it is a real Railgun 0zk address. `viewKey` lets
 * either party watch the deposit on-chain.
 */
export interface EscrowAccount {
  readonly keyTuple: {
    readonly spendingKey: string;
    readonly nullifyingKey: string;
    readonly viewingKey: string;
  };
  readonly depositAddress: string;
  readonly viewKey: Uint8Array;
}

/**
 * Encryption context for verifiable SWE, mirroring the crate's
 * `EncryptionContext`: the decryption key is a valid BLS aggregate signature
 * from `threshold` of the `committee` keys over `chosenText`.
 */
export interface SweContext {
  /** Committee public keys: 96-byte BLS12-381 G2 compressed points. */
  committee: Uint8Array[];
  threshold: number;
  /** The committee-signed identity (escrow encoding decided in Phase 7). */
  chosenText: Uint8Array;
}

/**
 * Verifiable SWE ciphertext addressed to a signing committee.
 *
 * The {@link SweContext} fields are carried on the ciphertext so that
 * `sweDecrypt` is self-contained (the crate's `decrypt` takes the context as
 * a separate argument; the TS surface folds it into the ciphertext value).
 */
export interface SweCiphertext {
  readonly ciphertext: Uint8Array;
  readonly threshold: number;
  readonly committee: Uint8Array[];
  readonly chosenText: Uint8Array;
}

/** Output bundle of {@link ZenoCryptoBackend.sweEncryptAndProve}. */
export interface SweEncryptResult {
  ciphertext: SweCiphertext;
  /** Well-formedness + plaintext-equality bundle (opaque). */
  proof: Uint8Array;
  /** G1 Pedersen commitment to the plaintext (opaque). */
  commitment: Uint8Array;
}

/** Statement for a discrete-log-equality proof. */
export interface DleqStatement {
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}

/**
 * Machine-readable failure category for {@link ZenoCryptoError}.
 *
 * `insufficient-signers`, `signers-not-subset`, `signer-mask-length-mismatch`,
 * and `no-dlog-exists` adopt the verifiable-swe crate's error taxonomy;
 * `unsafe-flag-missing`, `mainnet-chain`, `invalid-input`, and
 * `not-available` are TS-side codes for the stub rails and the facade.
 */
export type ZenoCryptoErrorCode =
  | 'insufficient-signers'
  | 'signers-not-subset'
  | 'signer-mask-length-mismatch'
  | 'no-dlog-exists'
  | 'unsafe-flag-missing'
  | 'mainnet-chain'
  | 'invalid-input'
  | 'not-available';

/**
 * Error thrown by every backend entry point.
 *
 * The wasm backend additionally traps Rust panics at the bindgen boundary
 * and rethrows them as this class; no raw Wasm traps escape.
 */
export class ZenoCryptoError extends Error {
  override readonly name = 'ZenoCryptoError';
  readonly code: ZenoCryptoErrorCode;
  readonly detail: string;

  constructor(code: ZenoCryptoErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Backend-neutral crypto surface (spec 02 section 3, revised per R2).
 *
 * All byte parameters are `Uint8Array`; hex conversion happens at the
 * shared-models boundary. Randomness-consuming calls take an injected
 * {@link SecureRandom} so tests are deterministic and production callers
 * wire `crypto.getRandomValues` via {@link defaultSecureRandom}.
 */
export interface ZenoCryptoBackend {
  /** Generates a key share for `pool` from injected secure randomness. */
  generateKeyShare(pool: PoolId, random: SecureRandom): KeyShare;

  /**
   * Derives the escrow account from the local share and the counterparty's
   * public share. Both parties recompute this and the results must match.
   */
  deriveEscrowAccount(pool: PoolId, local: KeyShare, remotePub: PubShare): EscrowAccount;

  /**
   * Encrypts `message` toward `ctx.committee` with reconstruction
   * `ctx.threshold`, binding the ciphertext to `ctx.chosenText`, and proves
   * well-formedness plus plaintext equality against the returned Pedersen
   * commitment (the crate's fused `encrypt_and_prove`).
   *
   * @throws ZenoCryptoError `invalid-input` for an out-of-range threshold.
   */
  sweEncryptAndProve(message: Uint8Array, ctx: SweContext, random: SecureRandom): SweEncryptResult;

  /**
   * Recovers the plaintext given an aggregate committee signature over the
   * chosen text and the boolean mask of which committee members signed.
   *
   * @throws ZenoCryptoError `signer-mask-length-mismatch` when the mask
   *   length differs from the committee size, `insufficient-signers` when
   *   the mask popcount is below the threshold (both before any crypto),
   *   `no-dlog-exists` when the aggregate signature does not authorize the
   *   ciphertext (wrong signers, wrong chosen text, or tampered bytes).
   */
  sweDecrypt(ct: SweCiphertext, aggSignature: Uint8Array, signers: boolean[]): Uint8Array;

  /** Verifies the encrypt-and-prove bundle against `ctx` and `commitment`. */
  sweVerify(ct: SweCiphertext, proof: Uint8Array, ctx: SweContext, commitment: Uint8Array): boolean;

  /** Proves discrete-log equality for `statement` using `witness`. */
  proveDleq(witness: Uint8Array, statement: DleqStatement, random: SecureRandom): Uint8Array;

  /** Verifies a DLEQ proof against `statement`. */
  verifyDleq(proof: Uint8Array, statement: DleqStatement): boolean;

  /** Identifies which backend is in use; `stub-unsafe` has no security properties. */
  backendKind(): 'stub-unsafe' | 'wasm';
}
