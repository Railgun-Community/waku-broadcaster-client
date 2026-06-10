import { describe, expect, test } from 'vitest';
import { decodeWinnerNotifyMessageData } from './index.js';
import { loadFixture, unwrap, unwrapErr, type DataFixture } from './tests/helpers.js';

const fixture = loadFixture<DataFixture>('winner-notify-data');

const mutated = (mutate: (d: Record<string, unknown>) => void): Record<string, unknown> => {
  const data = structuredClone(fixture.data);
  mutate(data);
  return data;
};

describe('decodeWinnerNotifyMessageData', () => {
  test('decodes the golden fixture', () => {
    expect(unwrap(decodeWinnerNotifyMessageData(fixture.data))).toEqual(fixture.data);
  });

  test('rejects accept: false (only acceptance is ever sent)', () => {
    const data = mutated((d) => {
      d['accept'] = false;
    });
    expect(unwrapErr(decodeWinnerNotifyMessageData(data)).kind).toBe('schema');
  });

  test('rejects a missing pairId', () => {
    const data = mutated((d) => delete d['pairId']);
    expect(unwrapErr(decodeWinnerNotifyMessageData(data)).kind).toBe('schema');
  });

  test('rejects a senderSetupPubkey of the wrong length', () => {
    const data = mutated((d) => {
      d['senderSetupPubkey'] = 'abcd';
    });
    expect(unwrapErr(decodeWinnerNotifyMessageData(data)).kind).toBe('schema');
  });

  test('rejects a pairId equal to the intentId only by length, not value', () => {
    // pairId and intentId are independent 16-byte ids; equality is legal, format is not.
    const data = mutated((d) => {
      d['pairId'] = d['intentId'];
    });
    expect(decodeWinnerNotifyMessageData(data).ok).toBe(true);
  });
});
