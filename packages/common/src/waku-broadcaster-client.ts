import {
  Chain,
  delay,
  isDefined,
  POI_REQUIRED_LISTS,
  BroadcasterConnectionStatus,
  SelectedBroadcaster,
} from '@railgun-community/shared-models';
import { LightNode } from '@waku/sdk';
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
import { contentTopics } from './waku/waku-topics.js';

export class WakuBroadcasterClient {
  private static chain: Chain;
  private static statusCallback: BroadcasterConnectionStatusCallback;
  private static started = false;
  private static isRestarting = false;

  static failureCount = 0;

  static async start(
    chain: Chain,
    broadcasterOptions: BroadcasterOptions,
    statusCallback: BroadcasterConnectionStatusCallback,
    broadcasterDebugger?: BroadcasterDebugger,
  ) {
    if (WakuBroadcasterClient.started) {
      BroadcasterDebug.log(
        'Waku Broadcaster Client is already started in start()',
      );
      return;
    }

    if (broadcasterDebugger) {
      BroadcasterDebug.setDebugger(broadcasterDebugger);
    }

    BroadcasterDebug.log('Starting Waku Broadcaster Client...');

    WakuBroadcasterClient.chain = chain;
    WakuBroadcasterClient.statusCallback = statusCallback;

    BroadcasterDebug.log(
      `Passing in broadcaster options: ${broadcasterOptions}`,
    );
    WakuBroadcasterWakuCore.setBroadcasterOptions(broadcasterOptions);

    BroadcasterDebug.log('Initializing Broadcaster Fee Cache...');
    BroadcasterFeeCache.init(
      broadcasterOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      WakuBroadcasterClient.started = false;

      BroadcasterDebug.log('Initializing Waku client...');
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
    // Check if the client is started
    WakuBroadcasterClient.checkIsStarted('stop()');

    await WakuBroadcasterWakuCore.disconnect(true);
    WakuBroadcasterClient.started = false;
    WakuBroadcasterClient.updateStatus();
  }

  static isStarted() {
    WakuBroadcasterClient.checkIsStarted('isStarted()');

    return WakuBroadcasterClient.started;
  }

  static checkIsStarted(functionName: string) {
    if (!WakuBroadcasterClient.started) {
      throw new Error(
        'Waku Broadcaster Client is not started in ' + functionName,
      );
    }
  }

  /**
   * Start keep-alive poller which checks Broadcaster status every few seconds.
   */
  static poller() {
    WakuBroadcasterClient.checkIsStarted('poller()');

    WakuObservers.poller(WakuBroadcasterClient.statusCallback);
  }

  static async setChain(chain: Chain): Promise<void> {
    WakuBroadcasterClient.checkIsStarted('setChain()');

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

  static getLightPushPeerCount(): number {
    WakuBroadcasterClient.checkIsStarted('getLightPushPeerCount()');

    return WakuBroadcasterWakuCore.getLightPushPeerCount();
  }

  static getFilterPeerCount(): number {
    WakuBroadcasterClient.checkIsStarted('getFilterPeerCount()');

    return WakuBroadcasterWakuCore.getFilterPeerCount();
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

  static async tryReconnect(resetCache = true): Promise<void> {
    WakuBroadcasterClient.checkIsStarted('tryReconnect()');

    BroadcasterDebug.log('Trying to reconnect to Waku...');
    // Reset cached broadcaster fees, which will reset status to "Searching".
    if (resetCache) {
      BroadcasterFeeCache.resetCache(WakuBroadcasterClient.chain);
    }
    const status = WakuBroadcasterClient.updateStatus();

    await WakuBroadcasterClient.restart(resetCache);
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

  private static async restart(resetCache = true): Promise<void> {
    if (WakuBroadcasterClient.isRestarting || !WakuBroadcasterClient.started) {
      if (WakuBroadcasterClient.isRestarting) {
        BroadcasterDebug.log('Waku is already restarting');
      } else {
        BroadcasterDebug.log('Waku is not started');
      }
    }
    WakuBroadcasterClient.isRestarting = true;

    try {
      BroadcasterDebug.log('Restarting Waku...');
      await WakuBroadcasterWakuCore.reinitWaku(
        WakuBroadcasterClient.chain,
        resetCache,
      );
      WakuBroadcasterClient.isRestarting = false;
    } catch (cause) {
      WakuBroadcasterClient.isRestarting = false;
      if (!(cause instanceof Error)) {
        return;
      }
      BroadcasterDebug.error(
        new Error('Error reinitializing Waku Broadcaster Client', { cause }),
      );
    }
  }

  static updateStatus(): BroadcasterConnectionStatus {
    WakuBroadcasterClient.checkIsStarted('updateStatus()');

    const status = BroadcasterStatus.getBroadcasterConnectionStatus(
      WakuBroadcasterClient.chain,
    );
    console.log('Broadcaster status in updateStatus:', status);

    WakuBroadcasterClient.statusCallback(WakuBroadcasterClient.chain, status);

    return status;
  }

  // Waku Transport functions
  static async addTransportSubscription(
    waku: Optional<LightNode>,
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

  static getWakuCore(): Optional<LightNode> {
    WakuBroadcasterClient.checkIsStarted('getWakuCore()');

    return WakuBroadcasterWakuCore.waku;
  }
}
