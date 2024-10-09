import {
  Chain,
  delay,
  POI_REQUIRED_LISTS,
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
import { WakuObservers } from './waku/waku-subscriptions.js';
import { WakuBroadcasterWakuCore } from './waku/waku-broadcaster-waku-core.js';
import { contentTopics } from './waku/waku-topics.js';
import { LightNode } from '@waku/sdk';

export class WakuBroadcasterClient {
  private static chain: Chain;
  private static statusCallback: BroadcasterConnectionStatusCallback;
  private static started = false;

  static pollDelay = 3000;

  static async start(
    chain: Chain,
    broadcasterOptions: BroadcasterOptions,
    statusCallback: BroadcasterConnectionStatusCallback,
    broadcasterDebugger?: BroadcasterDebugger,
  ) {
    if (broadcasterDebugger) {
      BroadcasterDebug.setDebugger(broadcasterDebugger);
    }

    BroadcasterDebug.log('Starting Waku...');

    this.chain = chain;
    this.statusCallback = statusCallback;

    BroadcasterDebug.log('Setting broadcaster options...');
    WakuBroadcasterWakuCore.setBroadcasterOptions(broadcasterOptions);

    BroadcasterDebug.log('Initializing BroadcasterFeeCache...');
    BroadcasterFeeCache.init(
      broadcasterOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      this.started = false;
      BroadcasterDebug.log('Initializing Waku...');
      await WakuBroadcasterWakuCore.initWaku(chain);
      this.started = true;

      BroadcasterDebug.log('Waku initialized successfully.');
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  /**
   * Allow for stopping the Waku broadcaster client.
   */
  static async stop() {
    await WakuBroadcasterWakuCore.disconnect();
    this.started = false;
    this.updateStatus();
  }

  static async setChain(chain: Chain): Promise<void> {
    if (!WakuBroadcasterClient.started) {
      BroadcasterDebug.log('Waku not started in setChain()');
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
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
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
   * The function `findAllBroadcastersForChain` returns an array of all available broadcasters fee-tokens for a given chain.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find all broadcasters for.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
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
   * The function `findRandomBroadcasterForToken` selects a random broadcaster from a list of broadcasters that is based on
   * their fees for a specific token, and how much higher their fees are compared to the broadcaster with
   * the lowest fees.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a broadcaster broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
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
   * returns an array of selected broadcasters based on the provided parameters.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network; a broadcaster broadcasting fees for this token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
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

  /**
   * Sets the allowlist and blocklist for pre-broadcast checks.
   *
   * @param allowlist
   * @param blocklist
   */
  static setAddressFilters(
    allowlist: Optional<string[]>,
    blocklist: Optional<string[]>,
  ): void {
    AddressFilter.setAllowlist(allowlist);
    AddressFilter.setBlocklist(blocklist);
  }

  /**
   * Checks if a token is supported by the broadcaster using the fee topic message recieved.
   *
   * @param chain
   * @param tokenAddress
   * @param useRelayAdapt
   * @returns boolean
   */
  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): boolean {
    return BroadcasterFeeCache.supportsToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
  }

  /**
   * Start keep-alive poller which checks Broadcaster status every few seconds.
   */
  static async pollStatus(): Promise<void> {
    // Poll until the client is stopped
    while (WakuBroadcasterClient.started) {
      // Callback the connection status on each poll
      this.updateStatus();

      // TODO: if disconnected or error status, ensure subscriptions can ping, otherwise resubscribe

      // Delay before next poll
      await delay(WakuBroadcasterClient.pollDelay);
    }
  }

  private static updateStatus() {
    const status = BroadcasterStatus.getBroadcasterConnectionStatus(this.chain);

    this.statusCallback(this.chain, status);
  }

  // Waku Transport functions
  static async addTransportSubscription(
    waku: Optional<LightNode>,
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
    WakuBroadcasterWakuCore.broadcastMessage(data, customTopic);
  }

  static getWakuCore(): Optional<LightNode> {
    return WakuBroadcasterWakuCore.waku;
  }
}
