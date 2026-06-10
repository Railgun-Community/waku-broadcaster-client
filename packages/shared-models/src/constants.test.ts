import { describe, expect, test } from 'vitest';
import * as constants from './constants.js';

// Values are pinned verbatim from specs/01-shared-models-spec.md section 6.
// A drift in either direction breaks this test on purpose.
describe('protocol constants', () => {
  test.each([
    ['ZENO_PROTOCOL_VERSION', 'v0'],
    ['DEFAULT_CLUSTER_ID', 6],
    ['DEFAULT_SHARD_ID', 0],
    ['ID_BYTES', 16],
    ['SOLVER_AD_CADENCE_MS', 15000],
    ['SOLVER_AD_JITTER_MS', 2000],
    ['SOLVER_AD_EXPIRY_MS', 300000],
    ['INTENT_EXPIRY_MS', 60000],
    ['QUOTE_WAIT_TIMEOUT_MS', 30000],
    ['STORE_LOOKBACK_MS', 60000],
    ['REPLY_REPUBLISH_COUNT', 10],
    ['REPLY_REPUBLISH_INTERVAL_MS', 3000],
    ['RETRY_CADENCE_MS', 2000],
    ['GIVE_UP_MS', 60000],
    ['SESSION_ROUND_TIMEOUT_MS', 60000],
    ['SESSION_TOTAL_TIMEOUT_MS', 180000],
    ['VARIANCE_BAND_LOWER_BPS', 9500],
    ['VARIANCE_BAND_UPPER_BPS', 11000],
    ['MAX_SUPPORTED_PAIRS', 256],
    ['MAX_SESSION_ROUNDS', 16],
  ])('%s equals %j', (name, expected) => {
    expect(constants[name as keyof typeof constants]).toBe(expected);
  });

  test('POOL_IDS contains exactly railgun-v2', () => {
    expect(constants.POOL_IDS).toEqual(['railgun-v2']);
  });
});
