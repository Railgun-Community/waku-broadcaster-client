import { describe, expect, test } from 'vitest';
import { createIntentIdentity, IdentityDisposedError } from './intent-ephemeral-identity.js';
import { hexToBytes, loadIntentFixture, queueEntropy, utf8Bytes } from './tests/helpers.js';

const fixture = loadIntentFixture();

const identityFromSecret = (secret: Uint8Array) =>
  createIntentIdentity({ entropy: queueEntropy([secret]) });

describe('createIntentIdentity', () => {
  test('distinct entropy produces distinct keypairs', async () => {
    const a = await identityFromSecret(new Uint8Array(32).fill(0x11));
    const b = await identityFromSecret(new Uint8Array(32).fill(0x33));
    expect(a.publicKeyHex()).not.toBe(b.publicKeyHex());
    expect(a.dhSecret()).not.toEqual(b.dhSecret());
  });

  test('entropy matching the fixture private key derives the pinned public key', async () => {
    const identity = await identityFromSecret(hexToBytes(fixture.privateKey));
    expect(identity.publicKeyHex()).toBe(fixture.publicKey);
  });

  test('signing the fixture canonical bytes reproduces the pinned signature', async () => {
    const identity = await identityFromSecret(hexToBytes(fixture.privateKey));
    await expect(identity.sign(utf8Bytes(fixture.canonical))).resolves.toBe(fixture.signature);
  });

  test('dhSecret returns the 32 secret key bytes', async () => {
    const identity = await identityFromSecret(hexToBytes(fixture.privateKey));
    const secret = identity.dhSecret();
    expect(secret).toHaveLength(32);
    expect(secret).toEqual(hexToBytes(fixture.privateKey));
  });

  test('dispose makes every method throw IdentityDisposedError', async () => {
    const identity = await identityFromSecret(hexToBytes(fixture.privateKey));
    identity.dispose();
    expect(() => identity.publicKeyHex()).toThrow(IdentityDisposedError);
    expect(() => identity.dhSecret()).toThrow(IdentityDisposedError);
    await expect(async () => identity.sign(utf8Bytes('x'))).rejects.toThrow(IdentityDisposedError);
  });

  test('dispose zeroes the buffer previously returned by dhSecret', async () => {
    const identity = await identityFromSecret(hexToBytes(fixture.privateKey));
    const secret = identity.dhSecret();
    identity.dispose();
    expect(secret).toEqual(new Uint8Array(32));
  });
});
