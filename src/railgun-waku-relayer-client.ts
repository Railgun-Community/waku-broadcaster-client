import {
  Chain,
  delay,
  RelayerConnectionStatus,
  SelectedRelayer,
} from '@railgun-community/shared-models';
import { RelayerFeeCache } from './fees/relayer-fee-cache';
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
  private static chain: Chain;
  private static status: RelayerConnectionStatus;
  private static statusCallback: RelayerConnectionStatusCallback;
  private static started = false;
  private static isRestarting = false;

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

  static isStarted() {
    return this.started;
  }

  static setChain(chain: Chain): void {
    if (!RailgunWakuRelayerClient.started) {
      return;
    }

    RailgunWakuRelayerClient.chain = chain;
    WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
    RailgunWakuRelayerClient.updateStatus();
  }

  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer> {
    if (!RailgunWakuRelayerClient.started) {
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

  static async tryReconnect(): Promise<void> {
    // Reset fees, which will reset status to "Disconnected".
    RelayerFeeCache.resetCache(RailgunWakuRelayerClient.chain);
    RailgunWakuRelayerClient.updateStatus();

    await RailgunWakuRelayerClient.restart();
  }

  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ) {
    return RelayerFeeCache.supportsToken(chain, tokenAddress, useRelayAdapt);
  }

  private static async restart(): Promise<void> {
    if (this.isRestarting) {
      return;
    }
    this.isRestarting = true;
    try {
      await WakuRelayerWakuCore.reinitWaku(this.chain);
      this.isRestarting = false;
      this.updateStatus();
    } catch (err) {
      this.isRestarting = false;
      if (!(err instanceof Error)) {
        return;
      }
      RelayerDebug.log('Error reinitializing Waku Relayer Client');
      RelayerDebug.error(err);
    }
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

    this.status = status;
    this.statusCallback(this.chain, status);

    if (
      status === RelayerConnectionStatus.Disconnected ||
      status === RelayerConnectionStatus.Error
    ) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.restart();
    }
  }
}
