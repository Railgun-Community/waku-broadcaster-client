import * as ed from '@noble/ed25519';
import { canonicalize, decodeIntentMessage, INTENT_EXPIRY_MS } from '@zeno/shared-models';
import { describe, expect, test } from 'vitest';
import { createMockNode } from '../transport/tests/mocks.js';
import { topicForIntents, topicForQuotes } from '../transport/topics.js';
import { broadcastIntent } from './intent.js';
import {
  createBroadcastHarness,
  hexToBytes,
  intentParamsFrom,
  loadIntentFixture,
  queueEntropy,
  unwrap,
  utf8Bytes,
  type BroadcastHarness,
} from './tests/helpers.js';

const fixture = loadIntentFixture();
const NOW = fixture.data.expiry - INTENT_EXPIRY_MS;
const intentTopic = topicForIntents(fixture.data.chain);
const quoteTopic = topicForQuotes(fixture.data.chain, fixture.data.intentId);

const depsFor = (harness: BroadcastHarness) => ({
  filterManager: harness.filterManager,
  publish: harness.publish,
  entropy: queueEntropy([hexToBytes(fixture.data.intentId), hexToBytes(fixture.privateKey)]),
  now: () => NOW,
});

async function broadcastFixtureIntent() {
  const harness = createBroadcastHarness(createMockNode());
  const handle = await broadcastIntent(intentParamsFrom(fixture.data), depsFor(harness));
  return { harness, handle };
}

function publishedText(harness: BroadcastHarness): string {
  const record = harness.published[0];
  if (record === undefined) {
    throw new Error('expected a published intent, got none');
  }
  return new TextDecoder().decode(record.payload);
}

describe('broadcastIntent', () => {
  test('publishes the intent exactly once on the intents topic for the chain', async () => {
    const { harness } = await broadcastFixtureIntent();
    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]?.topic).toBe(intentTopic);
  });

  test('publishes with ephemeral false so Store persists the intent', async () => {
    const { harness } = await broadcastFixtureIntent();
    expect(harness.published[0]?.ephemeral).toBe(false);
  });

  test('published payload decodes via decodeIntentMessage to the pinned fixture message', async () => {
    const { harness } = await broadcastFixtureIntent();
    const message = unwrap(decodeIntentMessage(publishedText(harness)));
    expect(message.data).toEqual(fixture.data);
    expect(message.signature).toBe(fixture.signature);
  });

  test('published signature verifies over the canonical data bytes', async () => {
    const { harness } = await broadcastFixtureIntent();
    const message = unwrap(decodeIntentMessage(publishedText(harness)));
    const valid = await ed.verifyAsync(
      hexToBytes(message.signature),
      utf8Bytes(canonicalize(message.data)),
      hexToBytes(message.data.intentEphPubkey),
    );
    expect(valid).toBe(true);
  });

  test('returns a handle exposing the intentId, the signed data, and the identity', async () => {
    const { handle } = await broadcastFixtureIntent();
    expect(handle.intentId).toBe(fixture.data.intentId);
    expect(handle.data).toEqual(fixture.data);
    expect(handle.identity.publicKeyHex()).toBe(fixture.publicKey);
    expect(handle.identity.dhSecret()).toEqual(hexToBytes(fixture.privateKey));
  });

  test('expiry defaults to now plus INTENT_EXPIRY_MS', async () => {
    const { harness } = await broadcastFixtureIntent();
    const message = unwrap(decodeIntentMessage(publishedText(harness)));
    expect(message.data.expiry).toBe(NOW + INTENT_EXPIRY_MS);
  });

  test('params.expiryMs overrides the default expiry window', async () => {
    const harness = createBroadcastHarness(createMockNode());
    await broadcastIntent(
      { ...intentParamsFrom(fixture.data), expiryMs: 30_000 },
      depsFor(harness),
    );
    const message = unwrap(decodeIntentMessage(publishedText(harness)));
    expect(message.data.expiry).toBe(NOW + 30_000);
  });

  test('subscribes to the quote topic before publishing the intent', async () => {
    const { harness } = await broadcastFixtureIntent();
    expect(harness.log).toEqual([`subscribe:${quoteTopic}`, `publish:${intentTopic}`]);
    expect(harness.filterManager.activeTopics()).toEqual([quoteTopic]);
  });

  test('schema-invalid params reject before any subscribe or publish', async () => {
    const harness = createBroadcastHarness(createMockNode());
    const params = { ...intentParamsFrom(fixture.data), sellAmount: '0x0' };
    await expect(broadcastIntent(params, depsFor(harness))).rejects.toThrow();
    expect(harness.log).toEqual([]);
  });
});
