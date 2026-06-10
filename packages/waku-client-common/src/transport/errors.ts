export type ZenoTransportErrorKind =
  | 'send-timeout'
  | 'subscribe-failed'
  | 'backfill-failed'
  | 'node-init-failed'
  | 'stopped';

/** Structured transport failure carrying the topic and attempt context. */
export class ZenoTransportError extends Error {
  override readonly name = 'ZenoTransportError';
  readonly kind: ZenoTransportErrorKind;
  readonly topic: string | undefined;
  readonly attempts: number | undefined;

  constructor(
    kind: ZenoTransportErrorKind,
    message: string,
    context: { topic?: string; attempts?: number } = {},
  ) {
    super(message);
    this.kind = kind;
    this.topic = context.topic;
    this.attempts = context.attempts;
  }
}
