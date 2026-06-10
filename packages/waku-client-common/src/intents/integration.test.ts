import * as ed from '@noble/ed25519';
import {
  canonicalize,
  decodeIntentMessage,
  INTENT_EXPIRY_MS,
  type EciesEnvelope,
} from '@zeno/shared-models';
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
} from './tests/helpers.js';

const fixture = loadIntentFixture();
const NOW = fixture.data.expiry - INTENT_EXPIRY_MS;
const intentId = 'ab'.repeat(16);

const quoteEnvelope: EciesEnvelope = {
  pubkey: 'f1'.repeat(32),
  encryptedData: [`0x${'2a'.repeat(32)}`, `0x${'3b'.repeat(64)}`],
};

// Fresh (non-fixture) entropy: the round-trip must hold for any minted key,
// not just the pinned vector.
async function broadcastFromInstanceA() {
  const node = createMockNode();
  const harness = createBroadcastHarness(node);
  const handle = await broadcastIntent(intentParamsFrom(fixture.data), {
    filterManager: harness.filterManager,
    publish: harness.publish,
    entropy: queueEntropy([new Uint8Array(16).fill(0xab), new Uint8Array(32).fill(0x07)]),
    now: () => NOW,
  });
  return { node, harness, handle };
}

describe('intent broadcast integration over a shared mock node', () => {
  test('a receiver decodes and signature-verifies the published intent', async () => {
    const { harness } = await broadcastFromInstanceA();
    const record = harness.published[0];
    if (record === undefined) {
      throw new Error('expected a published intent, got none');
    }
    expect(record.topic).toBe(topicForIntents(fixture.data.chain));
    const text = new TextDecoder().decode(record.payload);
    const message = unwrap(decodeIntentMessage(text, { now: NOW, chain: fixture.data.chain }));
    expect(message.data.intentId).toBe(intentId);
    const valid = await ed.verifyAsync(
      hexToBytes(message.signature),
      utf8Bytes(canonicalize(message.data)),
      hexToBytes(message.data.intentEphPubkey),
    );
    expect(valid).toBe(true);
  });

  test('a quote envelope pushed onto the quote topic arrives in the sender stream', async () => {
    const { node, handle } = await broadcastFromInstanceA();
    const iterator = handle.envelopes()[Symbol.asyncIterator]();
    const next = iterator.next();
    node.push(topicForQuotes(fixture.data.chain, intentId), {
      payload: utf8Bytes(JSON.stringify(quoteEnvelope)),
      timestampMs: NOW,
    });
    const result = await next;
    expect(result.done).toBe(false);
    expect(result.value).toEqual(quoteEnvelope);
    await handle.cancel();
  });
});
