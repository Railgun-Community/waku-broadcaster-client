import { expect, test } from 'vitest';
import * as api from './index.js';

test('public surface exports the backends, the error class, and the dev signer', () => {
  expect(typeof api.createUnsafeStubBackend).toBe('function');
  expect(typeof api.createWasmBackend).toBe('function');
  expect(typeof api.ZenoCryptoError).toBe('function');
  expect(typeof api.unsafeStubCommitteeSign).toBe('function');
});
