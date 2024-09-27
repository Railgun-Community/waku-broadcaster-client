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

  static pollDelay = 3000;
  static failureCount = 0;

  static async start(
    chain: Chain,
    broadcasterOptions: BroadcasterOptions,
    statusCallback: BroadcasterConnectionStatusCallback,
    broadcasterDebugger?: BroadcasterDebugger,
  ) {
    // Check if already started
    if (WakuBroadcasterClient.started) {
      BroadcasterDebug.log(
        'Waku Broadcaster Client is already started in start()',
      );
      return;
    }

    // Set debugger
    if (broadcasterDebugger) {
      BroadcasterDebug.setDebugger(broadcasterDebugger);
    }

    // Console.log because the debugger does not initialize sometimes
    console.log('Starting Waku Broadcaster Client console.log');
    BroadcasterDebug.log('Starting Waku Broadcaster Client');

    WakuBroadcasterClient.chain = chain;
    WakuBroadcasterClient.statusCallback = statusCallback;

    WakuBroadcasterWakuCore.setBroadcasterOptions(broadcasterOptions);

    BroadcasterFeeCache.init(
      broadcasterOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      WakuBroadcasterClient.started = false;
      await WakuBroadcasterWakuCore.initWaku(chain);
      WakuBroadcasterClient.started = true;
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  static async stop() {
    await WakuBroadcasterWakuCore.disconnect(true);
    WakuBroadcasterClient.started = false;
    WakuBroadcasterClient.updateStatus();
  }

  /**
   * Start keep-alive poller which checks Broadcaster status every pollDelay milliseconds.
   */
  static async pollStatus(): Promise<void> {
    WakuBroadcasterClient.checkIsStarted('pollStatus()');

    // Check if poll should run
    if (!WakuBroadcasterClient.started) {
      BroadcasterDebug.log('Broadcaster Client stopped, cancelling pollStatus');
      return;
    }

    // // If no peers after 5 pollings, try reconnect
    // if (WakuBroadcasterClient.getMeshPeerCount() === 0) {
    //   WakuBroadcasterClient.failureCount++;
    //   if (WakuBroadcasterClient.failureCount > 5) {
    //     await WakuBroadcasterClient.tryReconnect();
    //     WakuBroadcasterClient.failureCount = 0;
    //   }
    // } else {
    //   WakuBroadcasterClient.failureCount = 0;
    // }

    // Update status in front end
    WakuBroadcasterClient.updateStatus();

    await delay(WakuBroadcasterClient.pollDelay);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    if (WakuBroadcasterClient.started) {
      WakuBroadcasterClient.pollStatus();
    } else {
      BroadcasterDebug.log('Broadcaster Client stopped, stopping pollStatus');
    }
  }

  static isStarted() {
    WakuBroadcasterClient.checkIsStarted('isStarted()');

    return WakuBroadcasterClient.started;
  }

  static checkIsStarted(functionName: string) {
    if (!WakuBroadcasterClient.started) {
      throw new Error(
        'Waku Broadcaster Client is not started, in ' + functionName,
      );
    }
  }

  static async updateChain(chain: Chain): Promise<void> {
    WakuBroadcasterClient.checkIsStarted('updateChain()');

    WakuBroadcasterClient.chain = chain;
    await WakuObservers.setObserversForChain(
      WakuBroadcasterWakuCore.waku,
      chain,
    );
    WakuBroadcasterClient.updateStatus();
  }

  static getContentTopics(): string[] {
    WakuBroadcasterClient.checkIsStarted('getContentTopics()');

    return WakuObservers.getCurrentContentTopics();
  }

  static getMeshPeerCount(): number {
    WakuBroadcasterClient.checkIsStarted('getMeshPeerCount()');

    return WakuBroadcasterWakuCore.getMeshPeerCount();
  }

  static getPubSubPeerCount(): number {
    WakuBroadcasterClient.checkIsStarted('getPubSubPeerCount()');

    return WakuBroadcasterWakuCore.getPubSubPeerCount();
  }

  static async getLightPushPeerCount(): Promise<number> {
    WakuBroadcasterClient.checkIsStarted('getLightPushPeerCount()');

    return await WakuBroadcasterWakuCore.getLightPushPeerCount();
  }

  static async getFilterPeerCount(): Promise<number> {
    WakuBroadcasterClient.checkIsStarted('getFilterPeerCount()');

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
    WakuBroadcasterClient.checkIsStarted('findBestBroadcaster()');

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
    WakuBroadcasterClient.checkIsStarted('findAllBroadcastersForChain()');

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
    WakuBroadcasterClient.checkIsStarted('findRandomBroadcasterForToken()');

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
    WakuBroadcasterClient.checkIsStarted('findBroadcastersForToken()');

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
    WakuBroadcasterClient.checkIsStarted('setAddressFilters()');

    AddressFilter.setAllowlist(allowlist);
    AddressFilter.setBlocklist(blocklist);
  }

  static supportsToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ) {
    WakuBroadcasterClient.checkIsStarted('supportsToken()');

    return BroadcasterFeeCache.supportsToken(
      chain,
      tokenAddress,
      useRelayAdapt,
    );
  }

  private static updateStatus(): BroadcasterConnectionStatus {
    WakuBroadcasterClient.checkIsStarted('updateStatus()');

    const status = BroadcasterStatus.getBroadcasterConnectionStatus(
      WakuBroadcasterClient.chain,
    );

    WakuBroadcasterClient.statusCallback(WakuBroadcasterClient.chain, status);

    return status;
  }

  // Waku Transport functions
  static async addTransportSubscription(
    waku: Optional<RelayNode>,
    topic: string,
    callback: (message: any) => void,
  ): Promise<void> {
    WakuBroadcasterClient.checkIsStarted('addTransportSubscription()');

    await WakuObservers.addTransportSubscription(
      WakuBroadcasterWakuCore.waku,
      topic,
      callback,
    );
  }

  static sendTransport(data: object, topic: string): void {
    WakuBroadcasterClient.checkIsStarted('sendTransport()');

    const customTopic = contentTopics.encrypted(topic);
    WakuBroadcasterWakuCore.relayMessage(data, customTopic);
  }

  static getWakuCore(): Optional<RelayNode> {
    WakuBroadcasterClient.checkIsStarted('getWakuCore()');

    return WakuBroadcasterWakuCore.waku;
  }
}
