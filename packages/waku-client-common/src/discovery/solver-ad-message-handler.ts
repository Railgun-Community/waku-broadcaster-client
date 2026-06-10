import {
  canonicalize,
  decodeSolverAdMessage,
  type ChainRef,
  type ZenoModelError,
} from '@zeno/shared-models';
import { verifyEd25519 } from '../util/ed25519.js';
import { hexToBytes, utf8Decode, utf8Encode } from '../util/hex.js';
import type { InsertResult, SolverAdCache } from './solver-ad-cache.js';
import type { Allowlist } from './trusted-solver-allowlist.js';

export type HandleAdError = ZenoModelError | { kind: 'bad-signature' } | { kind: 'not-allowed' };

export type HandleAdResult =
  | { status: InsertResult }
  | { status: 'rejected'; error: HandleAdError };

export type SolverAdHandler = (
  payload: Uint8Array,
  opts: { now: number },
) => Promise<HandleAdResult>;

function signatureValid(signature: string, data: object, pubkey: string): boolean {
  return verifyEd25519(hexToBytes(signature), utf8Encode(canonicalize(data)), hexToBytes(pubkey));
}

/**
 * The consumer-side ad pipeline: decode (schema, expiry, chain), verify the
 * ed25519 signature over the canonical bytes, apply the allowlist, insert.
 * Returns a structured result so callers can surface metrics per outcome.
 */
export function createSolverAdHandler(deps: {
  cache: SolverAdCache;
  allowlist?: Allowlist;
  chain: ChainRef;
}): SolverAdHandler {
  return async (payload, { now }) => {
    const decoded = decodeSolverAdMessage(utf8Decode(payload), { now, chain: deps.chain });
    if (!decoded.ok) {
      return { status: 'rejected', error: decoded.error };
    }
    const { data, signature } = decoded.value;
    if (!signatureValid(signature, data, data.solverPubkey)) {
      return { status: 'rejected', error: { kind: 'bad-signature' } };
    }
    if (deps.allowlist !== undefined && !deps.allowlist.check(data.solverPubkey)) {
      return { status: 'rejected', error: { kind: 'not-allowed' } };
    }
    return { status: deps.cache.insert(data, now) };
  };
}
