import { expect, test } from 'vitest';
import * as api from './index.js';

test('public surface exports the backends, the error class, and the dev aggregate signer', () => {
  expect(typeof api.createUnsafeStubBackend).toBe('function');
  expect(typeof api.createWasmBackend).toBe('function');
  expect(typeof api.ZenoCryptoError).toBe('function');
  expect(typeof api.unsafeStubAggregateSign).toBe('function');
  expect(typeof api.defaultSecureRandom).toBe('function');
});

test('defaultSecureRandom returns fresh bytes of the requested length', () => {
  const first = api.defaultSecureRandom(32);
  const second = api.defaultSecureRandom(32);
  expect(first).toBeInstanceOf(Uint8Array);
  expect(first).toHaveLength(32);
  expect(api.defaultSecureRandom(0)).toHaveLength(0);
  // 32 bytes of CSPRNG output colliding is a broken implementation, not luck.
  expect(first).not.toEqual(second);
});
