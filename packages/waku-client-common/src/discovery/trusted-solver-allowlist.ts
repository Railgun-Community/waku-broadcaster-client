export type AllowlistMode = 'off' | 'allow' | 'deny';

export interface Allowlist {
  check(solverPubkey: string): boolean;
  set(mode: AllowlistMode, keys?: string[]): void;
}

/**
 * Optional client-side solver filter (Railgun AddressFilter analog).
 * Default `off` passes everyone; `allow` passes only listed keys; `deny`
 * drops listed keys. Set by the host application, never learned.
 */
export function createAllowlist(init?: { mode: AllowlistMode; keys?: string[] }): Allowlist {
  let mode: AllowlistMode = init?.mode ?? 'off';
  let keys = new Set(init?.keys ?? []);
  return {
    check: (solverPubkey) => {
      if (mode === 'allow') {
        return keys.has(solverPubkey);
      }
      if (mode === 'deny') {
        return !keys.has(solverPubkey);
      }
      return true;
    },
    set: (nextMode, nextKeys) => {
      mode = nextMode;
      keys = new Set(nextKeys ?? []);
    },
  };
}
