import {
  Chain,
  delay,
  RelayerConnectionStatus,
  SelectedRelayer,
} from '@railgun-community/shared-models';
import { AddressFilter } from './filters/address-filter';
import {
  RelayerConnectionStatusCallback,
  RelayerDebugger,
} from './models/export-models';
import { RelayerSearch } from './search/best-relayer';
import { RelayerStatus } from './status/relayer-connection-status';
import { RelayerDebug } from './utils/relayer-debug';
import { WakuObservers } from './waku/waku-observers';
import { WakuRelayerWakuCore } from './waku/waku-relayer-waku-core';

export class RailgunWakuRelayerClient {
  static started = false;

  private static chain: Chain;
  private static status: RelayerConnectionStatus;
  private static statusCallback: RelayerConnectionStatusCallback;

  static async start(
    chain: Chain,
    wakuDirectPeers: string[],
    statusCallback: RelayerConnectionStatusCallback,
    relayerDebugger?: RelayerDebugger,
  ) {
    this.chain = chain;
    this.statusCallback = statusCallback;

    WakuRelayerWakuCore.directPeers = wakuDirectPeers;
    await WakuRelayerWakuCore.initWaku(chain);
    this.started = true;

    if (relayerDebugger) {
      RelayerDebug.setDebugger(relayerDebugger);
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pollStatus();
  }

  static setChain(chain: Chain): void {
    if (!this.started) {
      return;
    }

    this.chain = chain;
    WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
    this.updateStatus();
  }

  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer> {
    if (!this.started) {
      return;
    }

    return RelayerSearch.findBestRelayer(chain, tokenAddress, useRelayAdapt);
  }

  static setAddressFilters(
    allowlist: Optional<string[]>,
    blocklist: Optional<string[]>,
  ): void {
    AddressFilter.setAllowlist(allowlist);
    AddressFilter.setBlocklist(blocklist);
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
