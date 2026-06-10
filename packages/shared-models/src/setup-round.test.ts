import { describe, expect, test } from 'vitest';
import { decodeSetupRoundMessage, encodeMessage } from './index.js';
import { loadFixture, unwrap, unwrapErr, type MessageFixture } from './tests/helpers.js';

const fixture = loadFixture<MessageFixture>('setup-round');

const mutated = (mutate: (m: Record<string, unknown>) => void): string => {
  const message = structuredClone(fixture.message);
  mutate(message);
  return JSON.stringify(message);
};

describe('decodeSetupRoundMessage', () => {
  test('decodes the golden fixture', () => {
    const text = JSON.stringify(fixture.message);
    expect(unwrap(decodeSetupRoundMessage(text))).toEqual(fixture.message);
  });

  test('round-trips through encodeMessage', () => {
    const message = unwrap(decodeSetupRoundMessage(JSON.stringify(fixture.message)));
    expect(unwrap(decodeSetupRoundMessage(encodeMessage(message)))).toEqual(message);
  });

  test('carries no intentId (unlinkability of the setup channel)', () => {
    const message = unwrap(decodeSetupRoundMessage(JSON.stringify(fixture.message)));
    expect(Object.keys(message)).not.toContain('intentId');
  });

  test('rejects round 0', () => {
    expect(unwrapErr(decodeSetupRoundMessage(mutated((m) => (m['round'] = 0)))).kind).toBe(
      'out-of-range',
    );
  });

  test('rejects a round above MAX_SESSION_ROUNDS', () => {
    expect(unwrapErr(decodeSetupRoundMessage(mutated((m) => (m['round'] = 17)))).kind).toBe(
      'out-of-range',
    );
  });

  test('rejects a direction other than 0 or 1', () => {
    expect(unwrapErr(decodeSetupRoundMessage(mutated((m) => (m['direction'] = 2)))).kind).toBe(
      'schema',
    );
  });

  test('rejects a negative counter', () => {
    expect(unwrapErr(decodeSetupRoundMessage(mutated((m) => (m['counter'] = -1)))).kind).toBe(
      'out-of-range',
    );
  });

  test('rejects a counter at 2^32', () => {
    expect(unwrapErr(decodeSetupRoundMessage(mutated((m) => (m['counter'] = 2 ** 32)))).kind).toBe(
      'out-of-range',
    );
  });

  test('rejects a ciphertext without the 0x prefix', () => {
    const text = mutated((m) => (m['ciphertext'] = (m['ciphertext'] as string).slice(2)));
    expect(unwrapErr(decodeSetupRoundMessage(text)).kind).toBe('schema');
  });
});
