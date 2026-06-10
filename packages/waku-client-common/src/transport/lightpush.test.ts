import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { sendWithRetry, type PublishFn } from './lightpush.js';

const payload = new Uint8Array([1, 2, 3]);
const topic = '/zeno/v0/0-1-intents/json';
const alwaysFailingPublish: PublishFn = () => Promise.reject(new Error('always down'));

function recordingPublish(failures = 0): {
  publish: PublishFn;
  calls: () => { topic: string; ephemeral: boolean }[];
} {
  const calls: { topic: string; ephemeral: boolean }[] = [];
  let remainingFailures = failures;
  return {
    publish: (msg) => {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error('lightpush failed'));
      }
      calls.push({ topic: msg.topic, ephemeral: msg.ephemeral });
      return Promise.resolve();
    },
    calls: () => calls,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sendWithRetry', () => {
  test('publishes ads exactly once', async () => {
    const { publish, calls } = recordingPublish();
    const report = sendWithRetry(publish, { topic, payload, klass: 'ad', ephemeral: true });
    await vi.runAllTimersAsync();
    expect((await report).publishes).toBe(1);
    expect(calls()).toHaveLength(1);
  });

  test('passes the ephemeral flag through to the publish layer', async () => {
    const { publish, calls } = recordingPublish();
    const pending = sendWithRetry(publish, { topic, payload, klass: 'ad', ephemeral: true });
    await vi.runAllTimersAsync();
    await pending;
    expect(calls()[0]?.ephemeral).toBe(true);
  });

  test('republishes replies 10 times at 3 second spacing', async () => {
    const { publish, calls } = recordingPublish();
    const pending = sendWithRetry(publish, { topic, payload, klass: 'reply', ephemeral: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(8 * 3000);
    expect(calls()).toHaveLength(10);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls()).toHaveLength(10);
    expect((await pending).publishes).toBe(10);
  });

  test('retries a failed publish attempt at the 2 second cadence', async () => {
    const { publish, calls } = recordingPublish(2);
    const pending = sendWithRetry(publish, { topic, payload, klass: 'ad', ephemeral: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls()).toHaveLength(1);
    const report = await pending;
    expect(report.attempts).toBe(3);
    expect(report.publishes).toBe(1);
  });

  test('gives up after the 60 second budget with a structured error', async () => {
    const pending = sendWithRetry(alwaysFailingPublish, {
      topic,
      payload,
      klass: 'ad',
      ephemeral: true,
    });
    const outcome = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(61_000);
    const error = (await outcome) as { kind: string; topic: string };
    expect(error.kind).toBe('send-timeout');
    expect(error.topic).toBe(topic);
  });
});
