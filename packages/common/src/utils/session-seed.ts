import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, randomBytes } from '@noble/hashes/utils';
import { isDefined } from './is-defined.js';

const SESSION_SEED_BYTE_LENGTH = 32;

// Created once per module runtime (per client), never reset by cache refresh
// or reconnect.
let sessionSeed: Optional<string>;

export const getSessionSeed = (): string => {
  if (!isDefined(sessionSeed)) {
    sessionSeed = bytesToHex(randomBytes(SESSION_SEED_BYTE_LENGTH));
  }
  return sessionSeed;
};

// Test controls only. Not part of the public client API.
export const setSessionSeedForTests = (seed: string): void => {
  sessionSeed = seed;
};

export const resetSessionSeedForTests = (): void => {
  sessionSeed = undefined;
};

// Deterministic 64-char hex digest (HMAC-SHA-256). The random session seed is
// the HMAC key and `rankInput` is the message, producing
// unpredictable-but-session-stable fixed-width rank digests. Fixed-width hex
// digests compare correctly as strings, matching the byte order of the HMAC
// output, and the digest is portable across Node and browser runtimes.
export const sessionRankDigest = (rankInput: string): string => {
  return bytesToHex(hmac(sha256, getSessionSeed(), rankInput));
};
