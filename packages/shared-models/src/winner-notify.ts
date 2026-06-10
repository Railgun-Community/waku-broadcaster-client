import { z } from 'zod';
import { runSchema } from './codec.js';
import { type Result } from './errors.js';
import { Hex16, Hex32 } from './scalars.js';

export const WinnerNotifyMessageData = z.object({
  accept: z.literal(true),
  intentId: Hex16,
  pairId: Hex16,
  senderSetupPubkey: Hex32,
});

export type WinnerNotifyMessageData = z.infer<typeof WinnerNotifyMessageData>;

/**
 * Validates a decrypted winner notification body. Losing solvers receive
 * nothing, so `accept` is always literally true.
 */
export function decodeWinnerNotifyMessageData(value: unknown): Result<WinnerNotifyMessageData> {
  return runSchema(WinnerNotifyMessageData, value);
}
