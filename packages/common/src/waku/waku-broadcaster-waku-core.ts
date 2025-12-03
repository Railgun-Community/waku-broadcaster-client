import { WakuBroadcasterWakuCoreBase } from './waku-broadcaster-waku-core-base.js';

export class WakuBroadcasterWakuCore extends WakuBroadcasterWakuCoreBase {
  protected static connect(): Promise<void> {
    return Promise.resolve();
  }
}
