export type LifecycleStatus = 'connecting' | 'connected' | 'disconnected' | 'stopped';

/** Seam to the node object; injected so unit tests never touch @waku/sdk. */
export interface LifecycleNode {
  peerCount(): number;
  stop(): Promise<void>;
}

export interface LifecycleOpts {
  createNode: () => Promise<LifecycleNode>;
  /** Shared node (e.g. the Railway wallet's). Used as-is, never stopped or recreated by us. */
  existingNode?: LifecycleNode;
  statusCallback: (status: LifecycleStatus) => void;
  pollIntervalMs?: number;
  graceMs?: number;
  stallTimeoutMs?: number;
  backoff?: { minMs: number; maxMs: number };
}

export interface Lifecycle {
  /** Resolves when the node first reaches Connected (or the lifecycle stops). */
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): LifecycleStatus;
  /** Filter layer reports its active subscription count; arms the stall detector. */
  setSubscriptionCount(n: number): void;
  /** Filter layer reports message arrival; resets the stall detector. */
  notifyActivity(): void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * LightNode lifecycle per spec section 2: Connecting -> Connected on peer
 * availability; Disconnected after sustained peer loss (grace period) or a
 * message stall while subscriptions are active; automatic reinit with capped
 * exponential backoff; Stopped is terminal.
 */
export function createLifecycle(opts: LifecycleOpts): Lifecycle {
  const pollMs = opts.pollIntervalMs ?? 3000;
  const graceMs = opts.graceMs ?? 10_000;
  const stallMs = opts.stallTimeoutMs ?? 120_000;
  const backoffMin = opts.backoff?.minMs ?? 5000;
  const backoffMax = opts.backoff?.maxMs ?? 60_000;
  const owned = opts.existingNode === undefined;

  let node: LifecycleNode | undefined;
  let status: LifecycleStatus = 'connecting';
  let emitted: LifecycleStatus | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let subscriptions = 0;
  let lastPeerSeen = 0;
  let lastActivity = 0;
  let backoffMs = backoffMin;
  let resolveStart: (() => void) | undefined;

  const emit = (next: LifecycleStatus): void => {
    status = next;
    if (emitted !== next) {
      emitted = next;
      opts.statusCallback(next);
    }
    if (next === 'connected' && resolveStart !== undefined) {
      resolveStart();
      resolveStart = undefined;
    }
  };

  const reinit = async (): Promise<void> => {
    emit('disconnected');
    if (owned && node !== undefined) {
      await node.stop().catch(() => undefined);
    }
    emit('connecting');
    if (owned) {
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, backoffMax);
      if (stopped) {
        return;
      }
      node = await opts.createNode();
    }
    lastPeerSeen = Date.now();
    lastActivity = Date.now();
  };

  const tick = async (): Promise<void> => {
    if (stopped || node === undefined) {
      return;
    }
    const now = Date.now();
    if (node.peerCount() >= 1) {
      lastPeerSeen = now;
      if (status !== 'connected') {
        backoffMs = backoffMin;
        lastActivity = now;
      }
      emit('connected');
      if (subscriptions > 0 && now - lastActivity > stallMs) {
        await reinit();
      }
    } else if (now - lastPeerSeen > graceMs) {
      await reinit();
    }
    schedule();
  };

  const schedule = (): void => {
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, pollMs);
    }
  };

  return {
    start: async () => {
      emit('connecting');
      node = opts.existingNode ?? (await opts.createNode());
      lastPeerSeen = Date.now();
      lastActivity = Date.now();
      const connected = new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
      schedule();
      return connected;
    },
    stop: async () => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (owned && node !== undefined) {
        await node.stop();
      }
      emit('stopped');
      if (resolveStart !== undefined) {
        resolveStart();
        resolveStart = undefined;
      }
    },
    status: () => status,
    setSubscriptionCount: (n) => {
      subscriptions = n;
    },
    notifyActivity: () => {
      lastActivity = Date.now();
    },
  };
}
