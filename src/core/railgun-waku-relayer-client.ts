import { Chain, delay } from '@railgun-community/shared-models';
import {
  RelayerConnectionStatus,
  RelayerConnectionStatusCallback,
} from '../models/export-models';
import { RelayerSearch } from '../search/best-relayer';
import { RelayerStatus } from '../status/relayer-connection-status';
import { WakuObservers } from '../waku/waku-observers';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core';

export class RailgunWakuRelayerClient {
  static chain: Chain;
  static status: RelayerConnectionStatus;
  static statusCallback: RelayerConnectionStatusCallback;

  static async start(
    chain: Chain,
    wakuDirectPeers: string[],
    statusCallback: RelayerConnectionStatusCallback,
  ) {
    this.chain = chain;
    this.statusCallback = statusCallback;

    WakuRelayerWakuCore.directPeers = wakuDirectPeers;
    await WakuRelayerWakuCore.initWaku(chain);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pollStatus();
  }

  static async setChain(chain: Chain) {
    this.chain = chain;
    WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
    this.updateStatus();
  }

  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ) {
    return RelayerSearch.findBestRelayer(chain, tokenAddress, useRelayAdapt);
  }

  /**
   * Start keep-alive poller which checks Relayer status every few seconds.
   */
  private static async pollStatus(): Promise<void> {
    this.updateStatus();

    const pollDelay = 5000;
    await delay(pollDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pollStatus();
  }

  private static updateStatus() {
    const status = RelayerStatus.getRelayerConnectionStatus(this.chain);
    if (status === this.status) {
      // Same status - do nothing.
      return;
    }

    this.status = status;
    this.statusCallback(status);

    if (
      status === RelayerConnectionStatus.Disconnected ||
      status === RelayerConnectionStatus.Error
    ) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      WakuRelayerWakuCore.reinitWaku(this.chain);
    }
  }
}
