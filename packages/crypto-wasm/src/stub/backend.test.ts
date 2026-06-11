import { describe, expect, test, vi } from 'vitest';
import {
  ZenoCryptoError,
  type SecureRandom,
  type SweContext,
  type ZenoCryptoErrorCode,
} from '../backend.js';
import { createUnsafeStubBackend, type UnsafeStubBackendOptions } from './backend.js';
import { unsafeStubAggregateSign } from './derive.js';

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

/**
 * Deterministic counter-based stand-in for `crypto.getRandomValues`: two
 * functions built from the same seed return identical byte streams, so tests
 * stay reproducible while exercising the injected-randomness interface.
 */
function seededRandom(seed: number): SecureRandom {
  let counter = 0;
  return (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      out[i] = (seed * 131 + counter * 31 + i * 7) & 0xff;
    }
    counter += 1;
    return out;
  };
}

const randomA = (): SecureRandom => seededRandom(0xa1);
const randomB = (): SecureRandom => seededRandom(0xb2);
const randomC = (): SecureRandom => seededRandom(0xc3);

// Committee keys are 96-byte placeholders standing in for BLS12-381 G2
// compressed points (spec 02-revision D4).
const memberOne = new Uint8Array(96).fill(0x11);
const memberTwo = new Uint8Array(96).fill(0x22);
const memberThree = new Uint8Array(96).fill(0x33);
const committee = [memberOne, memberTwo, memberThree];

const chosenText = utf8('zeno-escrow-event-v0');

const ctx: SweContext = { committee, threshold: 2, chosenText };

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

    backend.generateKeyShare('railgun-v2', randomA());
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
  test('is deterministic: the same seeded random produces the same share', () => {
    const first = makeBackend().generateKeyShare('railgun-v2', randomA());
    const second = makeBackend().generateKeyShare('railgun-v2', randomA());
    expect(toHex(first.secret)).toBe(toHex(second.secret));
    expect(toHex(first.pub)).toBe(toHex(second.pub));
  });

  test('different randomness produces different shares', () => {
    const backend = makeBackend();
    const first = backend.generateKeyShare('railgun-v2', randomA());
    const second = backend.generateKeyShare('railgun-v2', randomB());
    expect(toHex(first.secret)).not.toBe(toHex(second.secret));
    expect(toHex(first.pub)).not.toBe(toHex(second.pub));
  });

  test('public share is not the secret share', () => {
    const share = makeBackend().generateKeyShare('railgun-v2', randomA());
    expect(toHex(share.pub)).not.toBe(toHex(share.secret));
  });
});

describe('deriveEscrowAccount', () => {
  test('both directions derive the identical EscrowAccount', () => {
    const backend = makeBackend();
    const shareA = backend.generateKeyShare('railgun-v2', randomA());
    const shareB = backend.generateKeyShare('railgun-v2', randomB());
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
      first.generateKeyShare('railgun-v2', randomA()),
      first.generateKeyShare('railgun-v2', randomB()).pub,
    );
    const again = second.deriveEscrowAccount(
      'railgun-v2',
      second.generateKeyShare('railgun-v2', randomA()),
      second.generateKeyShare('railgun-v2', randomB()).pub,
    );
    expect(account.depositAddress).toBe(again.depositAddress);
    expect(account.keyTuple).toEqual(again.keyTuple);
  });

  test('deposit address uses the zeno-stub placeholder form', () => {
    const backend = makeBackend();
    const account = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', randomA()),
      backend.generateKeyShare('railgun-v2', randomB()).pub,
    );
    expect(account.depositAddress).toMatch(/^zeno-stub:[0-9a-f]{32}$/);
  });

  test('a different counterparty yields a different account', () => {
    const backend = makeBackend();
    const local = backend.generateKeyShare('railgun-v2', randomA());
    const withB = backend.deriveEscrowAccount(
      'railgun-v2',
      local,
      backend.generateKeyShare('railgun-v2', randomB()).pub,
    );
    const withC = backend.deriveEscrowAccount(
      'railgun-v2',
      local,
      backend.generateKeyShare('railgun-v2', randomC()).pub,
    );
    expect(withB.depositAddress).not.toBe(withC.depositAddress);
    expect(withB.keyTuple).not.toEqual(withC.keyTuple);
  });

  test('viewKey bytes match the viewing key of the tuple', () => {
    const backend = makeBackend();
    const account = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', randomA()),
      backend.generateKeyShare('railgun-v2', randomB()).pub,
    );
    expect(toHex(account.viewKey)).toBe(account.keyTuple.viewingKey);
  });

  test('key tuple members are pairwise distinct', () => {
    const backend = makeBackend();
    const { keyTuple } = backend.deriveEscrowAccount(
      'railgun-v2',
      backend.generateKeyShare('railgun-v2', randomA()),
      backend.generateKeyShare('railgun-v2', randomB()).pub,
    );
    expect(keyTuple.spendingKey).not.toBe(keyTuple.nullifyingKey);
    expect(keyTuple.spendingKey).not.toBe(keyTuple.viewingKey);
    expect(keyTuple.nullifyingKey).not.toBe(keyTuple.viewingKey);
  });
});

describe('verifiable SWE simulation', () => {
  const message = utf8('escrow key share for the railgun-v2 pool');

  test('carries the encryption context on the ciphertext', () => {
    const { ciphertext: ct } = makeBackend().sweEncryptAndProve(message, ctx, randomA());
    expect(ct.threshold).toBe(2);
    expect(ct.committee).toHaveLength(3);
    expect(toHex(ct.chosenText)).toBe(toHex(chosenText));
    expect(ct.ciphertext.length).toBeGreaterThan(0);
  });

  test('returns a non-empty proof and commitment', () => {
    const result = makeBackend().sweEncryptAndProve(message, ctx, randomA());
    expect(result.proof.length).toBeGreaterThan(0);
    expect(result.commitment.length).toBeGreaterThan(0);
  });

  test('commitment is stable for a fixed random function', () => {
    const first = makeBackend().sweEncryptAndProve(message, ctx, randomA());
    const second = makeBackend().sweEncryptAndProve(message, ctx, randomA());
    expect(toHex(first.commitment)).toBe(toHex(second.commitment));
    expect(toHex(first.ciphertext.ciphertext)).toBe(toHex(second.ciphertext.ciphertext));
    expect(toHex(first.proof)).toBe(toHex(second.proof));
  });

  test('different randomness yields a different commitment', () => {
    const backend = makeBackend();
    const first = backend.sweEncryptAndProve(message, ctx, randomA());
    const second = backend.sweEncryptAndProve(message, ctx, randomB());
    expect(toHex(first.commitment)).not.toBe(toHex(second.commitment));
  });

  test('round-trips with exactly threshold signers in the mask', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const signers = [true, true, false];
    const aggregate = unsafeStubAggregateSign(ct, signers);
    expect(toHex(backend.sweDecrypt(ct, aggregate, signers))).toBe(toHex(message));
  });

  test('round-trips with the full committee signing', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const signers = [true, true, true];
    const aggregate = unsafeStubAggregateSign(ct, signers);
    expect(toHex(backend.sweDecrypt(ct, aggregate, signers))).toBe(toHex(message));
  });

  test('mask popcount below threshold throws before any crypto', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    // Garbage aggregate: the popcount check must fire before any
    // signature verification or decryption is attempted.
    const garbage = new Uint8Array(32).fill(0xde);
    expectZenoError(
      () => backend.sweDecrypt(ct, garbage, [true, false, false]),
      'insufficient-signers',
    );
  });

  test('a mask shorter than the committee throws signer-mask-length-mismatch', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const aggregate = unsafeStubAggregateSign(ct, [true, true, false]);
    expectZenoError(
      () => backend.sweDecrypt(ct, aggregate, [true, true]),
      'signer-mask-length-mismatch',
    );
  });

  test('a mask longer than the committee throws signer-mask-length-mismatch', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const aggregate = unsafeStubAggregateSign(ct, [true, true, false]);
    expectZenoError(
      () => backend.sweDecrypt(ct, aggregate, [true, true, false, true]),
      'signer-mask-length-mismatch',
    );
  });

  test('a garbage aggregate signature throws no-dlog-exists', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const garbage = new Uint8Array(32).fill(0xad);
    expectZenoError(() => backend.sweDecrypt(ct, garbage, [true, true, false]), 'no-dlog-exists');
  });

  test('an aggregate over a different signer subset than the mask fails', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const aggregate = unsafeStubAggregateSign(ct, [false, true, true]);
    expectZenoError(() => backend.sweDecrypt(ct, aggregate, [true, true, false]), 'no-dlog-exists');
  });

  test('a tampered ciphertext fails even with an aggregate over the tampered bytes', () => {
    const backend = makeBackend();
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const tampered = { ...ct, ciphertext: flipByte(ct.ciphertext, 13) };
    const signers = [true, true, false];
    const aggregate = unsafeStubAggregateSign(tampered, signers);
    expectZenoError(() => backend.sweDecrypt(tampered, aggregate, signers), 'no-dlog-exists');
  });

  test('signatures bind to chosenText: another context aggregate cannot decrypt', () => {
    const backend = makeBackend();
    const otherCtx: SweContext = { committee, threshold: 2, chosenText: utf8('other-escrow') };
    const { ciphertext: ct } = backend.sweEncryptAndProve(message, ctx, randomA());
    const { ciphertext: otherCt } = backend.sweEncryptAndProve(message, otherCtx, randomA());
    const signers = [true, true, false];
    // The committee signed for the OTHER chosen text; that release must not
    // open a ciphertext bound to a different chosen text.
    const otherAggregate = unsafeStubAggregateSign(otherCt, signers);
    expectZenoError(() => backend.sweDecrypt(ct, otherAggregate, signers), 'no-dlog-exists');
    // The matching aggregate still works.
    const aggregate = unsafeStubAggregateSign(ct, signers);
    expect(toHex(backend.sweDecrypt(ct, aggregate, signers))).toBe(toHex(message));
  });

  test('rejects a zero threshold', () => {
    const zeroCtx: SweContext = { committee, threshold: 0, chosenText };
    expectZenoError(
      () => makeBackend().sweEncryptAndProve(message, zeroCtx, randomA()),
      'invalid-input',
    );
  });

  test('rejects a threshold above the committee size', () => {
    const highCtx: SweContext = { committee, threshold: 4, chosenText };
    expectZenoError(
      () => makeBackend().sweEncryptAndProve(message, highCtx, randomA()),
      'invalid-input',
    );
  });
});

describe('SWE proof verification', () => {
  const message = utf8('well-formed plaintext');

  test('encrypt-and-prove output verifies', () => {
    const backend = makeBackend();
    const {
      ciphertext: ct,
      proof,
      commitment,
    } = backend.sweEncryptAndProve(message, ctx, randomA());
    expect(backend.sweVerify(ct, proof, ctx, commitment)).toBe(true);
  });

  test('a flipped proof byte fails verification', () => {
    const backend = makeBackend();
    const {
      ciphertext: ct,
      proof,
      commitment,
    } = backend.sweEncryptAndProve(message, ctx, randomA());
    expect(backend.sweVerify(ct, flipByte(proof), ctx, commitment)).toBe(false);
  });

  test('a tampered commitment fails verification', () => {
    const backend = makeBackend();
    const {
      ciphertext: ct,
      proof,
      commitment,
    } = backend.sweEncryptAndProve(message, ctx, randomA());
    expect(backend.sweVerify(ct, proof, ctx, flipByte(commitment))).toBe(false);
  });

  test('a different context fails verification', () => {
    const backend = makeBackend();
    const {
      ciphertext: ct,
      proof,
      commitment,
    } = backend.sweEncryptAndProve(message, ctx, randomA());
    const otherCtx: SweContext = { committee, threshold: 2, chosenText: utf8('other-escrow') };
    expect(backend.sweVerify(ct, proof, otherCtx, commitment)).toBe(false);
  });

  test('a tampered ciphertext fails verification', () => {
    const backend = makeBackend();
    const {
      ciphertext: ct,
      proof,
      commitment,
    } = backend.sweEncryptAndProve(message, ctx, randomA());
    const tampered = { ...ct, ciphertext: flipByte(ct.ciphertext, 5) };
    expect(backend.sweVerify(tampered, proof, ctx, commitment)).toBe(false);
  });
});

describe('DLEQ proof stub', () => {
  test('round-trips', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement, randomA());
    expect(backend.verifyDleq(proof, statement)).toBe(true);
  });

  test('a flipped proof byte fails verification', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement, randomA());
    expect(backend.verifyDleq(flipByte(proof), statement)).toBe(false);
  });

  test('does not verify against a different statement', () => {
    const backend = makeBackend();
    const statement = { left: new Uint8Array(32).fill(0x70), right: new Uint8Array(32).fill(8) };
    const other = { left: new Uint8Array(32).fill(0x71), right: new Uint8Array(32).fill(8) };
    const proof = backend.proveDleq(utf8('witness'), statement, randomA());
    expect(backend.verifyDleq(proof, other)).toBe(false);
  });
});
