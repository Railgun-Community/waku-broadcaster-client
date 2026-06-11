import type { EciesEnvelope } from '@zeno/shared-models';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { encryptQuoteData } from '../quotes/quote-decrypt.js';
import {
  fixedEntropy,
  hexToBytes,
  loadEciesFixture,
  quoteVariant,
} from '../quotes/tests/helpers.js';
import { awaitBestQuote } from './await-best-quote.js';

const fixture = loadEciesFixture();
const NOW = fixture.plaintext.validUntil - 15_000;
const anchor = { buyPerSellQ96: (3000n * 10n ** 6n * 2n ** 96n) / 10n ** 18n };
const pubkey = (byte: string): string => byte.repeat(64);

function makeHandle(): {
  handle: {
    intentId: string;
    data: { sellAmount: string; sellToken: string; buyToken: string };
    identity: { dhSecret: () => Uint8Array };
    envelopes: () => AsyncIterable<EciesEnvelope>;
  };
  pushQuote: (overrides: Parameters<typeof quoteVariant>[1]) => void;
} {
  const buffered: EciesEnvelope[] = [];
  const waiters: ((r: IteratorResult<EciesEnvelope>) => void)[] = [];
  const push = (envelope: EciesEnvelope): void => {
    const waiter = waiters.shift();
    if (waiter === undefined) {
      buffered.push(envelope);
    } else {
      waiter({ value: envelope, done: false });
    }
  };
  return {
    handle: {
      intentId: fixture.plaintext.intentId,
      data: {
        sellAmount: '0xde0b6b3a7640000',
        sellToken: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        buyToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
      identity: { dhSecret: () => hexToBytes(fixture.recipientSk) },
      envelopes: () => ({
        [Symbol.asyncIterator]: () => ({
          next: (): Promise<IteratorResult<EciesEnvelope>> => {
            const value = buffered.shift();
            if (value !== undefined) {
              return Promise.resolve({ value, done: false });
            }
            return new Promise((resolve) => {
              waiters.push(resolve);
            });
          },
        }),
      }),
    },
    pushQuote: (overrides) => {
      push(
        encryptQuoteData(quoteVariant(fixture.plaintext, overrides), fixture.recipientPub, {
          entropy: fixedEntropy(0x66),
        }),
      );
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('awaitBestQuote', () => {
  test('collects quotes for the window and resolves with the best in-band one', async () => {
    const { handle, pushQuote } = makeHandle();
    const pending = awaitBestQuote(handle, {
      anchor: () => Promise.resolve(anchor),
      timeoutMs: 30_000,
    });
    pushQuote({ solverPubkey: pubkey('a'), buyAmount: '0xb2d05e00' });
    pushQuote({ solverPubkey: pubkey('b'), buyAmount: '0xb2d05e09' });
    await vi.advanceTimersByTimeAsync(30_000);
    const best = await pending;
    expect(best.data.solverPubkey).toBe(pubkey('b'));
    expect(best.outcome).toBe('in-band');
  });

  test('quotes for a different intent are dropped', async () => {
    const { handle, pushQuote } = makeHandle();
    const pending = awaitBestQuote(handle, {
      anchor: () => Promise.resolve(anchor),
      timeoutMs: 30_000,
    });
    pushQuote({ intentId: 'ffffffffffffffffffffffffffffffff' });
    const outcome = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(((await outcome) as { kind: string }).kind).toBe('no-quotes');
  });

  test('rejects with no-quotes when nothing arrives', async () => {
    const { handle } = makeHandle();
    const pending = awaitBestQuote(handle, {
      anchor: () => Promise.resolve(anchor),
      timeoutMs: 30_000,
    });
    const outcome = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(((await outcome) as { kind: string }).kind).toBe('no-quotes');
  });

  test('rejects with all-rejected when every quote is out of band', async () => {
    const { handle, pushQuote } = makeHandle();
    const pending = awaitBestQuote(handle, {
      anchor: () => Promise.resolve(anchor),
      timeoutMs: 30_000,
    });
    pushQuote({ buyAmount: '0x1' });
    const outcome = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(((await outcome) as { kind: string }).kind).toBe('all-rejected');
  });

  test('an unavailable anchor falls back to amount-only selection', async () => {
    const { handle, pushQuote } = makeHandle();
    const pending = awaitBestQuote(handle, {
      anchor: () => Promise.reject(new Error('rpc down')),
      timeoutMs: 30_000,
    });
    pushQuote({ solverPubkey: pubkey('a'), buyAmount: '0xb2d05e00' });
    await vi.advanceTimersByTimeAsync(30_000);
    const best = await pending;
    expect(best.outcome).toBe('anchor-unavailable');
  });

  test('omitting the anchor entirely is the testnet variance-off mode', async () => {
    const { handle, pushQuote } = makeHandle();
    const pending = awaitBestQuote(handle, { timeoutMs: 30_000 });
    pushQuote({ solverPubkey: pubkey('a') });
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await pending).outcome).toBe('anchor-unavailable');
  });
});
