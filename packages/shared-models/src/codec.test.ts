import * as fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { canonicalize, encodeMessage } from './index.js';
import { loadFixture, reverseKeyOrder, type SignedFixture } from './tests/helpers.js';

describe('canonicalize', () => {
  test('sorts object keys by Unicode code point, recursively', () => {
    expect(canonicalize({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  test('emits no insignificant whitespace', () => {
    expect(canonicalize({ a: [1, 2], b: 'x' })).toBe('{"a":[1,2],"b":"x"}');
  });

  test('preserves array element order as significant', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  test('escapes strings like JSON.stringify (RFC 8785)', () => {
    expect(canonicalize({ s: 'a"b\\c\nd\te\u0007' })).toBe('{"s":"a\\"b\\\\c\\nd\\te\\u0007"}');
  });

  test('passes non-ASCII through unescaped', () => {
    expect(canonicalize({ s: 'über' })).toBe('{"s":"über"}');
  });

  test('serializes safe non-negative integers in plain decimal', () => {
    expect(canonicalize({ n: 9007199254740991 })).toBe('{"n":9007199254740991}');
  });

  test.each([
    ['float', 1.5],
    ['negative zero', -0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['2^53', 2 ** 53],
  ])('throws on non-canonical number: %s', (_label, n) => {
    expect(() => canonicalize({ n })).toThrow();
  });

  test('reproduces the solver-ad golden canonical bytes', () => {
    const fixture = loadFixture<SignedFixture>('solver-ad');
    expect(canonicalize(fixture.data)).toBe(fixture.canonical);
  });

  test('reproduces the intent golden canonical bytes', () => {
    const fixture = loadFixture<SignedFixture>('intent');
    expect(canonicalize(fixture.data)).toBe(fixture.canonical);
  });

  test('is invariant under object key insertion order (property)', () => {
    const json = fc.dictionary(
      fc.string(),
      fc.oneof(
        fc.string(),
        fc.integer({ min: 0 }),
        fc.boolean(),
        fc.constant(null),
        fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer({ min: 0 }))),
        fc.array(fc.oneof(fc.string(), fc.integer({ min: 0 }))),
      ),
    );
    fc.assert(
      fc.property(json, (obj) => {
        expect(canonicalize(reverseKeyOrder(obj))).toBe(canonicalize(obj));
      }),
    );
  });

  test('is a fixed point through parse (property)', () => {
    const json = fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer({ min: 0 })));
    fc.assert(
      fc.property(json, (obj) => {
        const once = canonicalize(obj);
        expect(canonicalize(JSON.parse(once))).toBe(once);
      }),
    );
  });
});

describe('encodeMessage', () => {
  test('produces JSON that parses back to the same value', () => {
    const fixture = loadFixture<SignedFixture>('solver-ad');
    expect(JSON.parse(encodeMessage(fixture.message))).toEqual(fixture.message);
  });
});
