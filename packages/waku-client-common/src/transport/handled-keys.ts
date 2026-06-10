/** Storage seam for the replay-drop set: Node uses Level, Web uses IndexedDB. */
export interface HandledKeysPersistence {
  load(): Promise<string[]>;
  save(keys: string[]): Promise<void>;
}

export interface HandledKeys {
  has(key: string): boolean;
  add(key: string): void;
  /** Persists the newest diskCap keys through the configured persistence. */
  flush(): Promise<void>;
  size(): number;
}

const DEFAULT_MEM_CAP = 10_000;
const DEFAULT_DISK_CAP = 1_000;

/**
 * Replay-drop set with FIFO eviction (Railgun's handled-keys design): at most
 * memCap keys in memory, the newest diskCap persisted on flush, persisted keys
 * reloaded on construction so replays are dropped across restarts.
 */
export async function createHandledKeys(opts: {
  persistence?: HandledKeysPersistence;
  memCap?: number;
  diskCap?: number;
}): Promise<HandledKeys> {
  const memCap = opts.memCap ?? DEFAULT_MEM_CAP;
  const diskCap = opts.diskCap ?? DEFAULT_DISK_CAP;
  const keys = new Set<string>(opts.persistence === undefined ? [] : await opts.persistence.load());

  const evictOldestBeyondCap = (): void => {
    while (keys.size > memCap) {
      const oldest = keys.values().next().value;
      if (oldest === undefined) {
        return;
      }
      keys.delete(oldest);
    }
  };
  evictOldestBeyondCap();

  return {
    has: (key) => keys.has(key),
    add: (key) => {
      keys.add(key);
      evictOldestBeyondCap();
    },
    flush: async () => {
      await opts.persistence?.save([...keys].slice(-diskCap));
    },
    size: () => keys.size,
  };
}
