/**
 * `@zeno/crypto-wasm`: the stable TS facade over Zeno's escrow cryptography.
 *
 * Two backends behind one interface: `createUnsafeStubBackend` (pure TS,
 * developer-known keys, dev/test only) and `createWasmBackend` (Rust crates
 * via wasm-pack; throws `not-available` until the submodule lands).
 */
export {
  defaultSecureRandom,
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
  type ZenoCryptoErrorCode,
} from './backend.js';
export { createUnsafeStubBackend, type UnsafeStubBackendOptions } from './stub/backend.js';
export { unsafeStubAggregateSign } from './stub/derive.js';
export { createWasmBackend } from './wasm/backend.js';
