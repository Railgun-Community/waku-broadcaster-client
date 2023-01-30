import { Chain, delay } from '@railgun-community/shared-models';
import { RelayerConnectionStatus } from '../models/export-models';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core';

export class RailgunWakuRelayerClient {
  static status: RelayerConnectionStatus;

  static async start(chain: Chain) {
    await WakuRelayerWakuCore.initWaku(chain);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.keepAlive();
  }

  static async setChain(chain: Chain) {
    // TODO: Update chain, status, etc.
  }

  static getBestRelayer() {
    // TODO: Get best relayer for fees.
  }

  /**
   * Start keep-alive which resets Relayer status every few seconds.
   */
  private static async keepAlive(): Promise<void> {
    this.updateStatus();

    const keepAliveDelay = 5000;
    await delay(keepAliveDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.keepAlive();
  }

  private static updateStatus() {
    this.status = RelayerConnectionStatus.Searching;
    // TODO: Get actual status from util.
  }
}
