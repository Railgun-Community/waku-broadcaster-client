/**
 * `ZenoCryptoBackend`: the stable TS facade over Zeno's escrow cryptography
 * (key sharing, verifiable SWE, cross-group DLEQ, Pedersen opening).
 *
 * Two backends implement this interface: the developer-known stub
 * ({@link ../stub/backend.js}) and the wasm backend backed by the
 * `rust/zeno-crypto` submodule (spec 02 section 4, not yet available).
 * Phases 5-7 program against this interface only; the backend is selected
 * at client construction.
 */

/** Shielded pool identifier. v0 supports only the Railgun v2 pool. */
export type PoolId = 'railgun-v2';

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

/** Verifiable SWE ciphertext addressed to a signing committee. */
export interface SweCiphertext {
  readonly ciphertext: Uint8Array;
  readonly threshold: number;
  readonly committee: Uint8Array[];
}

/** Statement for a cross-group discrete-log-equality proof. */
export interface DleqStatement {
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}

/** Machine-readable failure category for {@link ZenoCryptoError}. */
export type ZenoCryptoErrorCode =
  | 'unsafe-flag-missing'
  | 'mainnet-chain'
  | 'invalid-input'
  | 'swe-threshold'
  | 'swe-decrypt-failed'
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
 * Backend-neutral crypto surface (spec 02 section 3).
 *
 * All byte parameters are `Uint8Array`; hex conversion happens at the
 * shared-models boundary. `generateKeyShare` takes an explicit seed so tests
 * are deterministic and key generation is auditable; callers pass fresh
 * CSPRNG bytes in production.
 */
export interface ZenoCryptoBackend {
  /** Derives a key share deterministically from `seed` for `pool`. */
  generateKeyShare(pool: PoolId, seed: Uint8Array): KeyShare;

  /**
   * Derives the escrow account from the local share and the counterparty's
   * public share. Both parties recompute this and the results must match.
   */
  deriveEscrowAccount(pool: PoolId, local: KeyShare, remotePub: PubShare): EscrowAccount;

  /** Encrypts `message` toward `committee` with reconstruction `threshold`. */
  sweEncrypt(message: Uint8Array, threshold: number, committee: Uint8Array[]): SweCiphertext;

  /**
   * Recovers the plaintext given at least `threshold` valid committee
   * signatures.
   *
   * @throws ZenoCryptoError `swe-threshold` below threshold,
   *   `swe-decrypt-failed` on a tampered ciphertext.
   */
  sweDecrypt(ct: SweCiphertext, signatures: Uint8Array[]): Uint8Array;

  /** Proves `ct` is a well-formed encryption of `message`. */
  sweProveWellFormedness(ct: SweCiphertext, message: Uint8Array): Uint8Array;

  /** Verifies a well-formedness proof against `ct`. */
  sweVerifyWellFormedness(ct: SweCiphertext, proof: Uint8Array): boolean;

  /** Proves discrete-log equality for `statement` using `witness`. */
  proveDleq(witness: Uint8Array, statement: DleqStatement): Uint8Array;

  /** Verifies a DLEQ proof against `statement`. */
  verifyDleq(proof: Uint8Array, statement: DleqStatement): boolean;

  /** Proves knowledge of the opening of a Pedersen commitment (railgun-v2 only in v0). */
  provePedersenOpening(commitment: Uint8Array, opening: Uint8Array, keyShare: PubShare): Uint8Array;

  /** Verifies a Pedersen opening proof against `commitment` and `keyShare`. */
  verifyPedersenOpening(commitment: Uint8Array, proof: Uint8Array, keyShare: PubShare): boolean;

  /** Identifies which backend is in use; `stub-unsafe` has no security properties. */
  backendKind(): 'stub-unsafe' | 'wasm';
}
