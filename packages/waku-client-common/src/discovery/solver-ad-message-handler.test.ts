import { describe, expect, test } from 'vitest';
import { createSolverAdCache } from './solver-ad-cache.js';
import { createSolverAdHandler } from './solver-ad-message-handler.js';
import { createAllowlist } from './trusted-solver-allowlist.js';
import { FIXTURE_NOW, loadSolverAdFixture, utf8 } from './tests/helpers.js';

const fixture = loadSolverAdFixture();
const chain = fixture.data.chain;
const NOW = FIXTURE_NOW;

function makeHandler(allowlist = createAllowlist()): {
  handle: ReturnType<typeof createSolverAdHandler>;
  cache: ReturnType<typeof createSolverAdCache>;
} {
  const cache = createSolverAdCache();
  const handle = createSolverAdHandler({ cache, allowlist, chain });
  return { handle, cache };
}

const payload = (): Uint8Array => utf8(JSON.stringify(fixture.message));

describe('createSolverAdHandler', () => {
  test('verifies and inserts a valid signed ad', async () => {
    const { handle, cache } = makeHandler();
    const result = await handle(payload(), { now: NOW });
    expect(result).toEqual({ status: 'inserted' });
    expect(cache.getSolverAds(chain, { now: NOW })).toEqual([fixture.data]);
    cache.dispose();
  });

  test('rejects a flipped signature bit as bad-signature', async () => {
    const { handle, cache } = makeHandler();
    const tampered = structuredClone(fixture.message);
    tampered.signature = `${tampered.signature.slice(0, -2)}00`;
    const result = await handle(utf8(JSON.stringify(tampered)), { now: NOW });
    expect(result).toEqual({ status: 'rejected', error: { kind: 'bad-signature' } });
    expect(cache.size(chain)).toBe(0);
    cache.dispose();
  });

  test('rejects tampered data as bad-signature', async () => {
    const { handle, cache } = makeHandler();
    const tampered = structuredClone(fixture.message);
    tampered.data.reliability = 1;
    const result = await handle(utf8(JSON.stringify(tampered)), { now: NOW });
    expect(result).toEqual({ status: 'rejected', error: { kind: 'bad-signature' } });
    cache.dispose();
  });

  test('rejects a wrong signer pubkey as bad-signature', async () => {
    const { handle, cache } = makeHandler();
    const tampered = structuredClone(fixture.message);
    tampered.data.solverPubkey = 'cc'.repeat(32);
    const result = await handle(utf8(JSON.stringify(tampered)), { now: NOW });
    expect(result).toEqual({ status: 'rejected', error: { kind: 'bad-signature' } });
    cache.dispose();
  });

  test('rejects an expired ad with the model error', async () => {
    const { handle, cache } = makeHandler();
    const result = await handle(payload(), { now: fixture.data.expiry + 1 });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.error.kind).toBe('expired');
    }
    cache.dispose();
  });

  test('rejects an ad scoped to another chain', async () => {
    const cache = createSolverAdCache();
    const handle = createSolverAdHandler({
      cache,
      allowlist: createAllowlist(),
      chain: { id: 137, type: 0 },
    });
    const result = await handle(payload(), { now: NOW });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.error.kind).toBe('chain-mismatch');
    }
    cache.dispose();
  });

  test('rejects malformed payload bytes', async () => {
    const { handle, cache } = makeHandler();
    const result = await handle(utf8('{nope'), { now: NOW });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.error.kind).toBe('malformed-json');
    }
    cache.dispose();
  });

  test('drops a denied solver as not-allowed before caching', async () => {
    const allowlist = createAllowlist({ mode: 'deny', keys: [fixture.data.solverPubkey] });
    const { handle, cache } = makeHandler(allowlist);
    const result = await handle(payload(), { now: NOW });
    expect(result).toEqual({ status: 'rejected', error: { kind: 'not-allowed' } });
    expect(cache.size(chain)).toBe(0);
    cache.dispose();
  });

  test('an identical redelivery is stale, not an error', async () => {
    const { handle, cache } = makeHandler();
    await handle(payload(), { now: NOW });
    const result = await handle(payload(), { now: NOW + 1000 });
    expect(result).toEqual({ status: 'stale' });
    cache.dispose();
  });
});
