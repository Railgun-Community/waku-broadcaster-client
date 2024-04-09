import {
  Chain,
  delay,
  isDefined,
  POI_REQUIRED_LISTS,
  RelayerConnectionStatus,
  SelectedRelayer,
} from '@railgun-community/shared-models';
import { RelayerFeeCache } from './fees/relayer-fee-cache.js';
import { AddressFilter } from './filters/address-filter.js';
import {
  RelayerConnectionStatusCallback,
  RelayerDebugger,
  RelayerOptions,
} from './models/export-models.js';
import { RelayerSearch } from './search/best-relayer.js';
import { RelayerStatus } from './status/relayer-connection-status.js';
import { RelayerDebug } from './utils/relayer-debug.js';
import { WakuObservers } from './waku/waku-observers.js';
import { WakuRelayerWakuCore } from './waku/waku-relayer-waku-core.js';
import { RelayNode } from '@waku/sdk';
import { contentTopics } from './waku/waku-topics.js';

export class WakuRelayerClient {
  private static chain: Chain;
  private static statusCallback: RelayerConnectionStatusCallback;
  private static started = false;
  private static isRestarting = false;

  static pollDelay = 10000;

  static async start(
    chain: Chain,
    relayerOptions: RelayerOptions,
    statusCallback: RelayerConnectionStatusCallback,
    relayerDebugger?: RelayerDebugger,
  ) {
    this.chain = chain;
    this.statusCallback = statusCallback;

    WakuRelayerWakuCore.setRelayerOptions(relayerOptions);

    if (relayerDebugger) {
      RelayerDebug.setDebugger(relayerDebugger);
    }

    RelayerFeeCache.init(
      relayerOptions.poiActiveListKeys ??
      POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      this.started = false;
      await WakuRelayerWakuCore.initWaku(chain);
      this.started = true;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.pollStatus();

    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Relayer network.', { cause });
    }
  }

  static async stop() {
    await WakuRelayerWakuCore.disconnect(true);
    this.started = false;
    this.updateStatus();
  }

  static isStarted() {
    return this.started;
  }

  static async setChain(chain: Chain): Promise<void> {
    if (!WakuRelayerClient.started) {
      return;
    }

    WakuRelayerClient.chain = chain;
    await WakuObservers.setObserversForChain(WakuRelayerWakuCore.waku, chain);
    WakuRelayerClient.updateStatus();
  }

  static getContentTopics(): string[] {
    return WakuObservers.getCurrentContentTopics();
  }

  static getMeshPeerCount(): number {
    return WakuRelayerWakuCore.getMeshPeerCount();
  }

  static getPubSubPeerCount(): number {
    return WakuRelayerWakuCore.getPubSubPeerCount();
  }

  static async getLightPushPeerCount(): Promise<number> {
    return await WakuRelayerWakuCore.getLightPushPeerCount();
  }

  static async getFilterPeerCount(): Promise<number> {
    return await WakuRelayerWakuCore.getFilterPeerCount();
  }
  /**
   * The function `findBestRelayer` finds the relayer with the lowest fees for a given chain and token.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a relayer for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a relayer broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedRelayer> object.
   */
  static findBestRelayer(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer> {
    if (!WakuRelayerClient.started) {
      return;
    }

    return RelayerSearch.findBestRelayer(chain, tokenAddress, useRelayAdapt);
  }

  /**
   * The function `findAllRelayersForChain` returns an array of all available relayers fee-tokens for a given chain.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find all relayers for.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedRelayer[]> object.
   */
  static findAllRelayersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer[]> {
    if (!WakuRelayerClient.started) {
      return [];
    }

    return RelayerSearch.findAllRelayersForChain(chain, useRelayAdapt);
  }

  /**
   * The function `findRandomRelayerForToken` selects a random relayer from a list of relayers that is based on
   * their fees for a specific token, and how much higher their fees are compared to the relayer with
   * the lowest fees.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a relayer for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a relayer broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @param {number} [percentageThreshold=5] - The `percentageThreshold` parameter is a number that
   * represents the maximum percentage increase in fees that a relayer can have compared to the relayer
   * with the lowest fees. For example, if the `percentageThreshold` is set to 5, it means that a
   * relayer can have a maximum of 5% higher fees than the relayer with the lowest fees and still be selected.
   * Defaults to 5.
   * @returns an Optional<SelectedRelayer> object.
   */
  static findRandomRelayerForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    percentageThreshold: number = 5,
  ): Optional<SelectedRelayer> {
    if (!WakuRelayerClient.started) {
      return;
    }

    return RelayerSearch.findRandomRelayerForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
      percentageThreshold,
    );
  }

  /**
   * The function `findRelayersForToken` takes in a chain, token address, and a boolean flag, and
   * returns an array of selected relayers based on the provided parameters.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a relayer for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network; a relayer broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedRelayer[]> object.
   */
  static findRelayersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedRelayer[]> {
    if (!WakuRelayerClient.started) {
      return;
    }

    return RelayerSearch.findRelayersForToken(chain, tokenAddress, useRelayAdapt);
  }

  static setAddressFilters(
    allowlist: Optional<string[]>,
    blocklist: Optional<string[]>,
  ): void {
    AddressFilter.setAllowlist(allowlist);
    AddressFilter.setBlocklist(blocklist);
  }

  static async tryReconnect(): Promise<void> {
    // Reset fees, which will reset status to "Searching".
    RelayerFeeCache.resetCache(WakuRelayerClient.chain);
    WakuRelayerClient.updateStatus();

    await WakuRelayerClient.restart();
  }

  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ) {
    return RelayerFeeCache.supportsToken(chain, tokenAddress, useRelayAdapt);
  }

  private static async restart(): Promise<void> {
    if (this.isRestarting || !this.started) {
      return;
    }
    this.isRestarting = true;
    try {
      RelayerDebug.log("Restarting Waku...")
      await WakuRelayerWakuCore.reinitWaku(this.chain);
      this.isRestarting = false;
    } catch (cause) {
      this.isRestarting = false;
      if (!(cause instanceof Error)) {
        return;
      }
      RelayerDebug.error(
        new Error('Error reinitializing Waku Relayer Client', { cause }),
      );
    }
  }

  /**
   * Start keep-alive poller which checks Relayer status every few seconds.
   */
  private static async pollStatus(): Promise<void> {
    this.updateStatus();

    await delay(WakuRelayerClient.pollDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pollStatus();
  }

  private static updateStatus() {
    const status = RelayerStatus.getRelayerConnectionStatus(this.chain);

    this.statusCallback(this.chain, status);

    if (
      status === RelayerConnectionStatus.Disconnected ||
      status === RelayerConnectionStatus.Error
    ) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.restart();
    }
  }
  // Waku Transport functions
  static async addTransportSubscription(
    waku: Optional<RelayNode>,
    topic: string,
    callback: (message: any) => void,
  ): Promise<void> {
    await WakuObservers.addTransportSubscription(
      WakuRelayerWakuCore.waku,
      topic,
      callback,
    );
  }

  static sendTransport(data: object, topic: string): void {
    const customTopic = contentTopics.encrypted(topic);
    WakuRelayerWakuCore.relayMessage(data, customTopic);
  }

}
