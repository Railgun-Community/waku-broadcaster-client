/**
 * Wasm backend entry point. Specified in Phase 2, lands when Willem's crates
 * land (spec 02 section 4): a git submodule at `rust/zeno-crypto`, built with
 * `wasm-pack --target bundler` into a single Wasm blob, with panics trapped
 * at the bindgen boundary and rethrown as {@link ZenoCryptoError}.
 */
import { ZenoCryptoError, type ZenoCryptoBackend } from '../backend.js';

/**
 * Constructs the wasm-backed {@link ZenoCryptoBackend}.
 *
 * @throws ZenoCryptoError `not-available` until the `rust/zeno-crypto`
 *   submodule lands. Use {@link createUnsafeStubBackend} for dev flows.
 */
export function createWasmBackend(): ZenoCryptoBackend {
  throw new ZenoCryptoError(
    'not-available',
    'the wasm backend ships with the rust/zeno-crypto submodule (spec 02 section 4); ' +
      'until it lands, use createUnsafeStubBackend for dev and test flows',
  );
}
