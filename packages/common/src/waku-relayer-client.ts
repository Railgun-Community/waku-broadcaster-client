import {
  Chain,
  delay,
  isDefined,
  POI_REQUIRED_LISTS,
  BroadcasterConnectionStatus,
  SelectedBroadcaster,
} from '@railgun-community/shared-models';
import { BroadcasterFeeCache } from './fees/broadcaster-fee-cache.js';
import { AddressFilter } from './filters/address-filter.js';
import {
  BroadcasterConnectionStatusCallback,
  BroadcasterDebugger,
  BroadcasterOptions,
} from './models/export-models.js';
import { BroadcasterSearch } from './search/best-broadcaster.js';
import { BroadcasterStatus } from './status/broadcaster-connection-status.js';
import { BroadcasterDebug } from './utils/broadcaster-debug.js';
import { WakuObservers } from './waku/waku-observers.js';
import { WakuBroadcasterWakuCore } from './waku/waku-broadcaster-waku-core.js';
import { RelayNode } from '@waku/sdk';
import { contentTopics } from './waku/waku-topics.js';

export class WakuBroadcasterClient {
  private static chain: Chain;
  private static statusCallback: BroadcasterConnectionStatusCallback;
  private static started = false;
  private static isRestarting = false;

  static pollDelay = 10000;

  static async start(
    chain: Chain,
    relayerOptions: BroadcasterOptions,
    statusCallback: BroadcasterConnectionStatusCallback,
    relayerDebugger?: BroadcasterDebugger,
  ) {
    this.chain = chain;
    this.statusCallback = statusCallback;

    WakuBroadcasterWakuCore.setBroadcasterOptions(relayerOptions);

    if (relayerDebugger) {
      BroadcasterDebug.setDebugger(relayerDebugger);
    }

    BroadcasterFeeCache.init(
      relayerOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      this.started = false;
      await WakuBroadcasterWakuCore.initWaku(chain);
      this.started = true;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.pollStatus();
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  static async stop() {
    await WakuBroadcasterWakuCore.disconnect(true);
    this.started = false;
    this.updateStatus();
  }

  static isStarted() {
    return this.started;
  }

  static async setChain(chain: Chain): Promise<void> {
    if (!WakuBroadcasterClient.started) {
      return;
    }

    WakuBroadcasterClient.chain = chain;
    await WakuObservers.setObserversForChain(
      WakuBroadcasterWakuCore.waku,
      chain,
    );
    WakuBroadcasterClient.updateStatus();
  }

  static getContentTopics(): string[] {
    return WakuObservers.getCurrentContentTopics();
  }

  static getMeshPeerCount(): number {
    return WakuBroadcasterWakuCore.getMeshPeerCount();
  }

  static getPubSubPeerCount(): number {
    return WakuBroadcasterWakuCore.getPubSubPeerCount();
  }

  static async getLightPushPeerCount(): Promise<number> {
    return await WakuBroadcasterWakuCore.getLightPushPeerCount();
  }

  static async getFilterPeerCount(): Promise<number> {
    return await WakuBroadcasterWakuCore.getFilterPeerCount();
  }
  /**
   * The function `findBestBroadcaster` finds the broadcaster with the lowest fees for a given chain and token.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a broadcaster broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedBroadcaster> object.
   */
  static findBestBroadcaster(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster> {
    if (!WakuBroadcasterClient.started) {
      return;
    }

    return BroadcasterSearch.findBestBroadcaster(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
  }

  /**
   * The function `findAllBroadcastersForChain` returns an array of all available relayers fee-tokens for a given chain.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find all relayers for.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedBroadcaster[]> object.
   */
  static findAllBroadcastersForChain(
    chain: Chain,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster[]> {
    if (!WakuBroadcasterClient.started) {
      return [];
    }

    return BroadcasterSearch.findAllBroadcastersForChain(chain, useRelayAdapt);
  }

  /**
   * The function `findRandomBroadcasterForToken` selects a random broadcaster from a list of relayers that is based on
   * their fees for a specific token, and how much higher their fees are compared to the broadcaster with
   * the lowest fees.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a broadcaster broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @param {number} [percentageThreshold=5] - The `percentageThreshold` parameter is a number that
   * represents the maximum percentage increase in fees that a broadcaster can have compared to the broadcaster
   * with the lowest fees. For example, if the `percentageThreshold` is set to 5, it means that a
   * broadcaster can have a maximum of 5% higher fees than the broadcaster with the lowest fees and still be selected.
   * Defaults to 5.
   * @returns an Optional<SelectedBroadcaster> object.
   */
  static findRandomBroadcasterForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
    percentageThreshold: number = 5,
  ): Optional<SelectedBroadcaster> {
    if (!WakuBroadcasterClient.started) {
      return;
    }

    return BroadcasterSearch.findRandomBroadcasterForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
      percentageThreshold,
    );
  }

  /**
   * The function `findBroadcastersForToken` takes in a chain, token address, and a boolean flag, and
   * returns an array of selected relayers based on the provided parameters.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network; a broadcaster broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select relayers that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedBroadcaster[]> object.
   */
  static findBroadcastersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster[]> {
    if (!WakuBroadcasterClient.started) {
      return;
    }

    return BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
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
    BroadcasterFeeCache.resetCache(WakuBroadcasterClient.chain);
    WakuBroadcasterClient.updateStatus();

    await WakuBroadcasterClient.restart();
  }

  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ) {
    return BroadcasterFeeCache.supportsToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
  }

  private static async restart(): Promise<void> {
    if (this.isRestarting || !this.started) {
      return;
    }
    this.isRestarting = true;
    try {
      BroadcasterDebug.log('Restarting Waku...');
      await WakuBroadcasterWakuCore.reinitWaku(this.chain);
      this.isRestarting = false;
    } catch (cause) {
      this.isRestarting = false;
      if (!(cause instanceof Error)) {
        return;
      }
      BroadcasterDebug.error(
        new Error('Error reinitializing Waku Broadcaster Client', { cause }),
      );
    }
  }

  /**
   * Start keep-alive poller which checks Broadcaster status every few seconds.
   */
  private static async pollStatus(): Promise<void> {
    this.updateStatus();

    await delay(WakuBroadcasterClient.pollDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.pollStatus();
  }

  private static updateStatus() {
    const status = BroadcasterStatus.getBroadcasterConnectionStatus(this.chain);

    this.statusCallback(this.chain, status);

    if (
      status === BroadcasterConnectionStatus.Disconnected ||
      status === BroadcasterConnectionStatus.Error
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
      WakuBroadcasterWakuCore.waku,
      topic,
      callback,
    );
  }

  static sendTransport(data: object, topic: string): void {
    const customTopic = contentTopics.encrypted(topic);
    WakuBroadcasterWakuCore.relayMessage(data, customTopic);
  }

  static getWakuCore(): Optional<RelayNode> {
    return WakuBroadcasterWakuCore.waku;
  }
}
