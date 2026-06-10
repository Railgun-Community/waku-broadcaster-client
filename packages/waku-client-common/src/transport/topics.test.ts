import * as fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  EPHEMERAL_BY_KIND,
  parseTopic,
  topicForDefault,
  topicForEncrypted,
  topicForIntents,
  topicForQuotes,
  topicForSetup,
  topicForSolvers,
  topicForWinner,
} from './topics.js';

const chain = { id: 1, type: 0 };
const intentId = '00112233445566778899aabbccddeeff';
const pairId = 'ffeeddccbbaa99887766554433221100';

describe('topic builders pin the exact strings', () => {
  test.each([
    [topicForDefault(), '/zeno/v0/default/json'],
    [topicForSolvers(chain), '/zeno/v0/0-1-solvers/json'],
    [topicForIntents(chain), '/zeno/v0/0-1-intents/json'],
    [topicForQuotes(chain, intentId), `/zeno/v0/0-1-quote-${intentId}/json`],
    [topicForWinner(chain), '/zeno/v0/0-1-winner/json'],
    [topicForSetup(pairId), `/zeno/v0/setup-${pairId}/json`],
    [topicForEncrypted('metrics'), '/zeno/v0/encrypted-metrics/json'],
  ])('%s', (actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe('parseTopic', () => {
  test('is the inverse of every builder', () => {
    expect(parseTopic(topicForDefault())).toEqual({ kind: 'default' });
    expect(parseTopic(topicForSolvers(chain))).toEqual({ kind: 'solvers', chain });
    expect(parseTopic(topicForIntents(chain))).toEqual({ kind: 'intents', chain });
    expect(parseTopic(topicForQuotes(chain, intentId))).toEqual({
      kind: 'quotes',
      chain,
      intentId,
    });
    expect(parseTopic(topicForWinner(chain))).toEqual({ kind: 'winner', chain });
    expect(parseTopic(topicForSetup(pairId))).toEqual({ kind: 'setup', pairId });
    expect(parseTopic(topicForEncrypted('metrics'))).toEqual({
      kind: 'encrypted',
      name: 'metrics',
    });
  });

  test.each([
    ['wrong app', '/railgun/v2/0-1-fees/json'],
    ['wrong version', '/zeno/v1/default/json'],
    ['truncated id', '/zeno/v0/0-1-quote-aabb/json'],
    ['uppercase id', `/zeno/v0/setup-${pairId.toUpperCase()}/json`],
    ['missing encoding suffix', '/zeno/v0/default'],
    ['non-decimal chain', '/zeno/v0/x-1-intents/json'],
    ['empty', ''],
  ])('returns undefined for %s', (_label, topic) => {
    expect(parseTopic(topic)).toBeUndefined();
  });

  test('round-trips arbitrary chains and ids (property)', () => {
    const chainArb = fc.record({
      id: fc.integer({ min: 0, max: 10_000_000 }),
      type: fc.integer({ min: 0, max: 100 }),
    });
    const idArb = fc
      .uint8Array({ minLength: 16, maxLength: 16 })
      .map((b) => Buffer.from(b).toString('hex'));
    fc.assert(
      fc.property(chainArb, idArb, (c, id) => {
        expect(parseTopic(topicForQuotes(c, id))).toEqual({
          kind: 'quotes',
          chain: c,
          intentId: id,
        });
        expect(parseTopic(topicForSetup(id))).toEqual({ kind: 'setup', pairId: id });
      }),
    );
  });
});

describe('ephemeral flags per message kind (spec section 5)', () => {
  test('matches the approved table', () => {
    expect(EPHEMERAL_BY_KIND).toEqual({
      default: true,
      solvers: true,
      intents: false,
      quotes: false,
      winner: false,
      setup: false,
      encrypted: false,
    });
  });
});
