import { describe, expect, test, vi } from 'vitest';
import { ZenoCryptoError, type ZenoCryptoErrorCode } from '../backend.js';
import { createUnsafeStubBackend, type UnsafeStubBackendOptions } from './backend.js';
import { unsafeStubCommitteeSign } from './derive.js';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const flipByte = (bytes: Uint8Array, index = 0): Uint8Array => {
  const copy = bytes.slice();
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
};

function expectZenoError(fn: () => unknown, code: ZenoCryptoErrorCode): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ZenoCryptoError);
    expect((error as ZenoCryptoError).code).toBe(code);
    return;
  }
  expect.unreachable(`expected ZenoCryptoError with code ${code}`);
}

const seedA = new Uint8Array(32).fill(0xa1);
const seedB = new Uint8Array(32).fill(0xb2);
const seedC = new Uint8Array(32).fill(0xc3);

const memberOne = new Uint8Array(32).fill(0x11);
const memberTwo = new Uint8Array(32).fill(0x22);
const memberThree = new Uint8Array(32).fill(0x33);
const committee = [memberOne, memberTwo, memberThree];

const devChain = { id: 31337, type: 0 };

const makeBackend = (overrides: Partial<UnsafeStubBackendOptions> = {}) =>
  createUnsafeStubBackend({
    unsafeStubCrypto: true,
    chain: devChain,
    logger: { warn: vi.fn() },
    ...overrides,
  });

describe('createUnsafeStubBackend safety rails', () => {
  test('throws without the unsafeStubCrypto acknowledgement', () => {
    const options = {
      unsafeStubCrypto: false,
      chain: devChain,
      logger: { warn: vi.fn() },
    } as unknown as UnsafeStubBackendOptions;
    expectZenoError(() => createUnsafeStubBackend(options), 'unsafe-flag-missing');
  });

  test.each([1, 10, 56, 137, 8453, 42161])('throws for mainnet chain id %i', (id) => {
    expectZenoError(() => makeBackend({ chain: { id, type: 0 } }), 'mainnet-chain');
  });

  test('warns exactly once per construction', () => {
    const warn = vi.fn();
    const backend = createUnsafeStubBackend({
      unsafeStubCrypto: true,
      chain: devChain,
      logger: { warn },
    });
    expect(warn).toHaveBeenCalledTimes(1);

    backend.generateKeyShare('railgun-v2', seedA);
    backend.backendKind();
    expect(warn).toHaveBeenCalledTimes(1);

    createUnsafeStubBackend({ unsafeStubCrypto: true, chain: devChain, logger: { warn } });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('reports the stub-unsafe backend kind', () => {
    expect(makeBackend().backendKind()).toBe('stub-unsafe');
  });
});

describe('generateKeyShare', () => {
  test('is deterministic: same seed produces the same share', () => {
    const first = makeBackend().generateKeyShare('railgun-v2', seedA);
    const second = makeBackend().generateKeyShare('railgun-v2', seedA);
    expect(toHex(first.secret)).toBe(toHex(second.secret));
    expect(toHex(first.pub)).toBe(toHex(second.pub));
  });

  test('different seeds produce different shares', () => {
    const backend = makeBackend();
    const first = backend.generateKeyShare('railgun-v2', seedA);
    const second = backend.generateKeyShare('railgun-v2', seedB);
    expect(toHex(first.secret)).not.toBe(toHex(second.secret));
    expect(toHex(first.pub)).not.toBe(toHex(second.pub));
  });

  test('public share is not the secret share', () => {
    const share = makeBackend().generateKeyShare('railgun-v2', seedA);
    expect(toHex(share.pub)).not.toBe(toHex(share.secret));
  });
});

describe('deriveEscrowAccount', () => {
  test('both directions derive the identical EscrowAccount', () => {
    const backend = makeBackend();
    const shareA = backend.generateKeyShare('railgun-v2', seedA);
    const shareB = backend.generateKeyShare('railgun-v2', seedB);
    const fromA = backend.deriveEscrowAccount('railgun-v2', shareA, shareB.pub);
    const fromB = backend.deriveEscrowAccount('railgun-v2', shareB, shareA.pub);
    expect(fromA.keyTuple).toEqual(fromB.keyTuple);
    expect(fromA.depositAddress).toBe(fromB.depositAddress);
    expect(toHex(fromA.viewKey)).toBe(toHex(fromB.viewKey));
  });

  test('is deterministic across backend constructions', () => {
    const first = makeBackend();
    const second = makeBackend();
    const account = first.deriveEscrowAccount(
      'railgun-v2',
      first.generateKeyShare('railgun-v2', seedA),
      first.generateKeyShare('railgun-v2', seedB).pub,
    );
    const again = second.deriveEscrowAccount(
      'railgun-v2',
      second.generateKeyShare('railgun-v2', seedA),
      second.generateKeyShare('railgun-v2', seedB).pub,
    );
    expect(account.depositAddress).toBe(again.depositAddress);
    expect(account.keyTuple).toEqual(again.keyTuple);
  });

  test('deposit address uses the zeno-stub placeholder form', () => {
    const backend = makeBackend();
    const account = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', seedA),
      backend.generateKeyShare('railgun-v2', seedB).pub,
    );
    expect(account.depositAddress).toMatch(/^zeno-stub:[0-9a-f]{32}$/);
  });

  test('a different counterparty yields a different account', () => {
    const backend = makeBackend();
    const local = backend.generateKeyShare('railgun-v2', seedA);
    const withB = backend.deriveEscrowAccount(
      'railgun-v2',
      local,
      backend.generateKeyShare('railgun-v2', seedB).pub,
    );
    const withC = backend.deriveEscrowAccount(
      'railgun-v2',
      local,
      backend.generateKeyShare('railgun-v2', seedC).pub,
    );
    expect(withB.depositAddress).not.toBe(withC.depositAddress);
    expect(withB.keyTuple).not.toEqual(withC.keyTuple);
  });

  test('viewKey bytes match the viewing key of the tuple', () => {
    const backend = makeBackend();
    const account = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', seedA),
      backend.generateKeyShare('railgun-v2', seedB).pub,
    );
    expect(toHex(account.viewKey)).toBe(account.keyTuple.viewingKey);
  });

  test('key tuple members are pairwise distinct', () => {
    const backend = makeBackend();
    const { keyTuple } = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', seedA),
      backend.generateKeyShare('railgun-v2', seedB).pub,
    );
    expect(keyTuple.spendingKey).not.toBe(keyTuple.nullifyingKey);
    expect(keyTuple.spendingKey).not.toBe(keyTuple.viewingKey);
    expect(keyTuple.nullifyingKey).not.toBe(keyTuple.viewingKey);
  });
});

describe('verifiable SWE simulation', () => {
  const message = utf8('escrow key share for the railgun-v2 pool');

  test('carries threshold and committee on the ciphertext', () => {
    const ct = makeBackend().sweEncrypt(message, 2, committee);
    expect(ct.threshold).toBe(2);
    expect(ct.committee).toHaveLength(3);
    expect(ct.ciphertext.length).toBeGreaterThan(0);
  });

  test('round-trips when the threshold is met', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const signatures = [
      unsafeStubCommitteeSign(memberOne, ct),
      unsafeStubCommitteeSign(memberTwo, ct),
    ];
    expect(toHex(backend.sweDecrypt(ct, signatures))).toBe(toHex(message));
  });

  test('round-trips with the full committee signing', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const signatures = committee.map((member) => unsafeStubCommitteeSign(member, ct));
    expect(toHex(backend.sweDecrypt(ct, signatures))).toBe(toHex(message));
  });

  test('throws below threshold (threshold - 1 signatures)', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    expectZenoError(
      () => backend.sweDecrypt(ct, [unsafeStubCommitteeSign(memberOne, ct)]),
      'swe-threshold',
    );
  });

  test('a duplicated signature does not count twice', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const signature = unsafeStubCommitteeSign(memberOne, ct);
    expectZenoError(() => backend.sweDecrypt(ct, [signature, signature]), 'swe-threshold');
  });

  test('garbage signatures are rejected', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const garbage = [new Uint8Array(32).fill(0xde), new Uint8Array(32).fill(0xad)];
    expectZenoError(() => backend.sweDecrypt(ct, garbage), 'swe-threshold');
  });

  test('a tampered ciphertext fails even with signatures over the tampered bytes', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const tampered = { ...ct, ciphertext: flipByte(ct.ciphertext, 13) };
    const signatures = [
      unsafeStubCommitteeSign(memberOne, tampered),
      unsafeStubCommitteeSign(memberTwo, tampered),
    ];
    expectZenoError(() => backend.sweDecrypt(tampered, signatures), 'swe-decrypt-failed');
  });

  test('rejects a zero threshold', () => {
    expectZenoError(() => makeBackend().sweEncrypt(message, 0, committee), 'invalid-input');
  });

  test('rejects a threshold above the committee size', () => {
    expectZenoError(() => makeBackend().sweEncrypt(message, 4, committee), 'invalid-input');
  });
});

describe('proof stubs', () => {
  const message = utf8('well-formed plaintext');

  test('SWE well-formedness proof round-trips', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const proof = backend.sweProveWellFormedness(ct, message);
    expect(backend.sweVerifyWellFormedness(ct, proof)).toBe(true);
  });

  test('a flipped SWE proof byte fails verification', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    const proof = backend.sweProveWellFormedness(ct, message);
    expect(backend.sweVerifyWellFormedness(ct, flipByte(proof))).toBe(false);
  });

  test('proving well-formedness for a mismatched message throws', () => {
    const backend = makeBackend();
    const ct = backend.sweEncrypt(message, 2, committee);
    expectZenoError(
      () => backend.sweProveWellFormedness(ct, utf8('a different plaintext')),
      'invalid-input',
    );
  });

  test('DLEQ proof round-trips', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement);
    expect(backend.verifyDleq(proof, statement)).toBe(true);
  });

  test('a flipped DLEQ proof byte fails verification', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement);
    expect(backend.verifyDleq(flipByte(proof), statement)).toBe(false);
  });

  test('a DLEQ proof does not verify against a different statement', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const other = { left: new Uint8Array(32).fill(0x71), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement);
    expect(backend.verifyDleq(proof, other)).toBe(false);
  });

  test('Pedersen opening proof round-trips', () => {
    const backend = makeBackend();
    const commitment = new Uint8Array(32).fill(0x90);
    const keyShare = backend.generateKeyShare('railgun-v2', seedA).pub;
    const proof = backend.provePedersenOpening(commitment, utf8('opening'), keyShare);
    expect(backend.verifyPedersenOpening(commitment, proof, keyShare)).toBe(true);
  });

  test('a flipped Pedersen proof byte fails verification', () => {
    const backend = makeBackend();
    const commitment = new Uint8Array(32).fill(0x90);
    const keyShare = backend.generateKeyShare('railgun-v2', seedA).pub;
    const proof = backend.provePedersenOpening(commitment, utf8('opening'), keyShare);
    expect(backend.verifyPedersenOpening(commitment, flipByte(proof), keyShare)).toBe(false);
  });

  test('a Pedersen proof does not verify against a different commitment', () => {
    const backend = makeBackend();
    const commitment = new Uint8Array(32).fill(0x90);
    const keyShare = backend.generateKeyShare('railgun-v2', seedA).pub;
    const proof = backend.provePedersenOpening(commitment, utf8('opening'), keyShare);
    const other = new Uint8Array(32).fill(0x91);
    expect(backend.verifyPedersenOpening(other, proof, keyShare)).toBe(false);
  });
});
