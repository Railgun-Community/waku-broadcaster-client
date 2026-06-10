import { INTENT_EXPIRY_MS, type EciesEnvelope } from '@zeno/shared-models';
import { describe, expect, test } from 'vitest';
import { createMockNode } from '../transport/tests/mocks.js';
import { topicForQuotes } from '../transport/topics.js';
import { IdentityDisposedError, type IntentIdentity } from './intent-ephemeral-identity.js';
import type { IntentHandle } from './intent-handle.js';
import { broadcastIntent } from './intent.js';
import {
  createBroadcastHarness,
  hexToBytes,
  intentParamsFrom,
  loadIntentFixture,
  queueEntropy,
  utf8Bytes,
} from './tests/helpers.js';

const fixture = loadIntentFixture();
const NOW = fixture.data.expiry - INTENT_EXPIRY_MS;
const quoteTopic = topicForQuotes(fixture.data.chain, fixture.data.intentId);

const validEnvelope: EciesEnvelope = {
  pubkey: 'd759793bbc13a2819a827c76adb6fba8a49aee007f49f2d0992d99b825ad2c48',
  encryptedData: [`0x${'a1'.repeat(32)}`, `0x${'c3'.repeat(64)}`],
};

async function broadcastOverMockNode() {
  const node = createMockNode();
  const harness = createBroadcastHarness(node);
  const handle: IntentHandle = await broadcastIntent(intentParamsFrom(fixture.data), {
    filterManager: harness.filterManager,
    publish: harness.publish,
    entropy: queueEntropy([hexToBytes(fixture.data.intentId), hexToBytes(fixture.privateKey)]),
    now: () => NOW,
  });
  const pushPayload = (text: string): void => {
    node.push(quoteTopic, { payload: utf8Bytes(text), timestampMs: NOW });
  };
  return { node, handle, pushPayload, activeTopics: () => harness.filterManager.activeTopics() };
}

describe('IntentHandle envelopes stream', () => {
  test('yields a quote envelope pushed while the iterator is waiting', async () => {
    const { handle, pushPayload } = await broadcastOverMockNode();
    const iterator = handle.envelopes()[Symbol.asyncIterator]();
    const next = iterator.next();
    pushPayload(JSON.stringify(validEnvelope));
    const result = await next;
    expect(result.done).toBe(false);
    expect(result.value).toEqual(validEnvelope);
  });

  test('buffers envelopes received before iteration and yields them in arrival order', async () => {
    const { handle, pushPayload } = await broadcastOverMockNode();
    const second: EciesEnvelope = { ...validEnvelope, pubkey: 'e0'.repeat(32) };
    pushPayload(JSON.stringify(validEnvelope));
    pushPayload(JSON.stringify(second));
    const iterator = handle.envelopes()[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual(validEnvelope);
    expect((await iterator.next()).value).toEqual(second);
  });

  test('drops junk payloads without ending the stream', async () => {
    const { handle, pushPayload } = await broadcastOverMockNode();
    const iterator = handle.envelopes()[Symbol.asyncIterator]();
    const next = iterator.next();
    pushPayload('not json at all');
    pushPayload(JSON.stringify({ pubkey: 'too-short', encryptedData: [] }));
    pushPayload(JSON.stringify(validEnvelope));
    const result = await next;
    expect(result.done).toBe(false);
    expect(result.value).toEqual(validEnvelope);
  });
});

describe('IntentHandle cancel', () => {
  test('unsubscribes the quote topic leaving no active subscriptions', async () => {
    const { node, handle, activeTopics } = await broadcastOverMockNode();
    expect(activeTopics()).toEqual([quoteTopic]);
    await handle.cancel();
    expect(activeTopics()).toEqual([]);
    expect(node.subscribedTopics()).toEqual([]);
  });

  test('ends the envelope stream', async () => {
    const { handle } = await broadcastOverMockNode();
    const iterator = handle.envelopes()[Symbol.asyncIterator]();
    const pending = iterator.next();
    await handle.cancel();
    expect((await pending).done).toBe(true);
    expect((await iterator.next()).done).toBe(true);
  });

  test('disposes the identity', async () => {
    const { handle } = await broadcastOverMockNode();
    await handle.cancel();
    expect(() => handle.identity.publicKeyHex()).toThrow(IdentityDisposedError);
    expect(() => handle.identity.dhSecret()).toThrow(IdentityDisposedError);
    // The handle holds the only reference to the full identity (spec section 4),
    // so its signing surface must be dead after cancel as well.
    const identity = handle.identity as IntentIdentity;
    await expect(async () => identity.sign(utf8Bytes('x'))).rejects.toThrow(IdentityDisposedError);
  });

  test('double-cancel is a no-op', async () => {
    const { handle, activeTopics } = await broadcastOverMockNode();
    await handle.cancel();
    await expect(handle.cancel()).resolves.toBeUndefined();
    expect(activeTopics()).toEqual([]);
  });
});
