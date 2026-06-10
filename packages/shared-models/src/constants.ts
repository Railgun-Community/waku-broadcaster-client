// Protocol constants, pinned verbatim from specs/01-shared-models-spec.md section 6.
// constants.test.ts breaks on any drift, deliberately.

export const ZENO_PROTOCOL_VERSION = 'v0';

export const DEFAULT_CLUSTER_ID = 6;
export const DEFAULT_SHARD_ID = 0;

export const ID_BYTES = 16;

export const SOLVER_AD_CADENCE_MS = 15_000;
export const SOLVER_AD_JITTER_MS = 2_000;
export const SOLVER_AD_EXPIRY_MS = 300_000;

export const INTENT_EXPIRY_MS = 60_000;
export const QUOTE_WAIT_TIMEOUT_MS = 30_000;

export const STORE_LOOKBACK_MS = 60_000;
export const REPLY_REPUBLISH_COUNT = 10;
export const REPLY_REPUBLISH_INTERVAL_MS = 3_000;
export const RETRY_CADENCE_MS = 2_000;
export const GIVE_UP_MS = 60_000;

export const SESSION_ROUND_TIMEOUT_MS = 60_000;
export const SESSION_TOTAL_TIMEOUT_MS = 180_000;

export const VARIANCE_BAND_LOWER_BPS = 9_500;
export const VARIANCE_BAND_UPPER_BPS = 11_000;

export const MAX_SUPPORTED_PAIRS = 256;
export const MAX_SESSION_ROUNDS = 16;

export const POOL_IDS = ['railgun-v2'] as const;
