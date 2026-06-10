import { expect, test } from 'vitest';
import { ZenoCryptoError } from '../backend.js';
import { createWasmBackend } from './backend.js';

test('createWasmBackend throws not-available until the submodule lands', () => {
  try {
    createWasmBackend();
  } catch (error) {
    expect(error).toBeInstanceOf(ZenoCryptoError);
    const { code, detail } = error as ZenoCryptoError;
    expect(code).toBe('not-available');
    expect(detail).toContain('rust/zeno-crypto');
    return;
  }
  expect.unreachable('expected createWasmBackend to throw');
});

// Deferred until the rust/zeno-crypto submodule lands (spec 02 section 6, GATE 2
// reviews the deferral).
test.todo('wasm boundary: rust panics surface as ZenoCryptoError, no raw traps escape');
test.todo('wasm boundary: no views into wasm memory are retained across calls');
test.todo('performance: prove/verify latency budget for the wasm backend');
