import {
  BroadcasterConnectionStatus,
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
import { contentTopics } from './waku/waku-topics.js';
import { LightNode, RelayNode } from '@waku/sdk';
import { WakuLightNodeCore } from './waku/waku-node/waku-light/waku-light-core.js';
import { WakuRelayNodeCore } from './waku/waku-node/waku-relay/waku-relay-core.js';
import { WakuLightSubscriptions } from './waku/waku-node/waku-light/waku-light-subscriptions.js';
import { WakuRelaySubscriptions } from './waku/waku-node/waku-relay/waku-relay-subscriptions.js';

// Use Light or Relay node for Waku connection
export enum WakuMode {
  Light = 'light',
  Relay = 'relay',
}

export class WakuBroadcasterClient {
  private static chain: Chain;
  private static statusCallback: BroadcasterConnectionStatusCallback;
  private static started = false;
  private static polling = false;
  static wakuMode: WakuMode = WakuMode.Light;
  private static pollCount = 0;

  static pollDelay = 3000;
  static maxLightNodePolls = 5; // Revert to relay node if light node is not connecting

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

    // Store chain and status callback
    this.chain = chain;
    this.statusCallback = statusCallback;

    BroadcasterDebug.log('Setting broadcaster options...');
    WakuLightNodeCore.setBroadcasterOptions(broadcasterOptions);
    WakuRelayNodeCore.setBroadcasterOptions(broadcasterOptions);

    BroadcasterDebug.log('Initializing BroadcasterFeeCache...');
    BroadcasterFeeCache.init(
      broadcasterOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    BroadcasterDebug.log('Initializing waku...');
    await this.initializeWaku(chain);

    BroadcasterDebug.log('~ Waku Broadcaster Client start() has completed ~');
  }

  /**
   * Initialize the waku client
   *
   * @param chain - The chain to connect to
   */
  private static async initializeWaku(chain: Chain): Promise<void> {
    try {
      if (this.wakuMode === WakuMode.Light) {
        await this.initializeWakuLightNode(chain);
      } else {
        await this.initializeWakuRelayNode(chain);
      }
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  /**
   * Start keep-alive poller which keeps connection status updated.
   * It assumes Waku handles reconnections automatically.
   *
   * Retries init if initial connection fails.
   * This function should be used for keeping connection alive if needed.
   *
   * @returns void
   */
  static async pollStatus(): Promise<void> {
    this.polling = true;

    while (this.polling) {
      BroadcasterDebug.log('Polling status...');

      const status = this.updateStatusCallback();
      BroadcasterDebug.log('Status updated.');

      if (status === BroadcasterConnectionStatus.Searching) {
        this.pollCount++;
        BroadcasterDebug.log(`Status searching: ${this.pollCount} times`);

        if (
          this.pollCount >= this.maxLightNodePolls &&
          this.wakuMode === WakuMode.Light
        ) {
          BroadcasterDebug.log(
            'Light node failed to connect after max polls, switching to relay node...',
          );
          this.wakuMode = WakuMode.Relay;
          await this.switchToRelayNode();
          this.pollCount = 0;
        }
      } else {
        this.pollCount = 0;
      }

      if (status === BroadcasterConnectionStatus.Error) {
        if (
          this.wakuMode === WakuMode.Light
            ? WakuLightNodeCore.connectFailed
            : WakuRelayNodeCore.connectFailed
        ) {
          BroadcasterDebug.log(
            'Reinitializing Waku after connection failure...',
          );
          await this.initializeWaku(this.chain);
        }
      }

      await delay(WakuBroadcasterClient.pollDelay);
    }
  }

  private static async switchToRelayNode(): Promise<void> {
    await WakuLightNodeCore.disconnect();
    WakuLightSubscriptions.resetCurrentChain();
    await this.initializeWakuRelayNode(this.chain);
  }

  private static async initializeWakuLightNode(chain: Chain): Promise<void> {
    try {
      this.started = false;
      await WakuLightNodeCore.initWaku(chain);
      this.started = true;
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  private static async initializeWakuRelayNode(chain: Chain): Promise<void> {
    try {
      this.started = false;
      await WakuRelayNodeCore.initWaku(chain);
      this.started = true;
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
  static async stop(): Promise<{
    chain: Chain;
    broadcasterOptions: BroadcasterOptions;
  }> {
    BroadcasterDebug.log('Stopping Waku...');

    if (this.wakuMode === WakuMode.Light) {
      await WakuLightNodeCore.disconnect();
    } else {
      await WakuRelayNodeCore.disconnect();
    }

    this.started = false;
    this.polling = false;
    BroadcasterDebug.log('Waku stopped.');

    const broadcasterOptions =
      this.wakuMode === WakuMode.Light
        ? WakuLightNodeCore.getBroadcasterOptions()
        : WakuRelayNodeCore.getBroadcasterOptions();

    return {
      chain: this.chain,
      broadcasterOptions,
    };
  }

  static async updateChain(chain: Chain): Promise<void> {
    if (!WakuBroadcasterClient.started) {
      BroadcasterDebug.log('Waku not started in updateChain()');
      return;
    }

    BroadcasterDebug.log(`Setting chain to ${chain.id}`);
    WakuBroadcasterClient.chain = chain;

    const waku = this.getWakuCore();
    if (this.wakuMode === WakuMode.Light) {
      await WakuLightSubscriptions.createSubscriptionsForChain(
        waku as LightNode,
        chain,
      );
    } else {
      await WakuRelaySubscriptions.createSubscriptionsForChain(
        waku as RelayNode,
        chain,
      );
    }

    WakuBroadcasterClient.updateStatusCallback();
  }

  static getContentTopics(): string[] {
    return this.wakuMode === WakuMode.Light
      ? WakuLightSubscriptions.getCurrentContentTopics()
      : WakuRelaySubscriptions.getCurrentContentTopics();
  }

  static async getLightPushPeerCount(): Promise<number> {
    return this.wakuMode === WakuMode.Light
      ? await WakuLightNodeCore.getLightPushPeerCount()
      : await WakuRelayNodeCore.getLightPushPeerCount();
  }

  static async getFilterPeerCount(): Promise<number> {
    return this.wakuMode === WakuMode.Light
      ? await WakuLightNodeCore.getFilterPeerCount()
      : await WakuRelayNodeCore.getFilterPeerCount();
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

  private static updateStatusCallback(): BroadcasterConnectionStatus {
    const status = BroadcasterStatus.getBroadcasterConnectionStatus(this.chain);

    BroadcasterDebug.log(
      `Status updated: ${status} for chain ${this.chain.id}`,
    );
    this.statusCallback(this.chain, status);

    return status;
  }

  // Waku Transport functions
  static async addTransportSubscription(
    topic: string,
    callback: (message: any) => void,
  ): Promise<void> {
    const waku = this.getWakuCore();
    if (this.wakuMode === WakuMode.Light) {
      await WakuLightSubscriptions.addTransportSubscription(
        waku as LightNode,
        topic,
        callback,
      );
    } else {
      await WakuRelaySubscriptions.addTransportSubscription(
        waku as RelayNode,
        topic,
        callback,
      );
    }
  }

  static sendTransport(data: object, topic: string): void {
    const customTopic = contentTopics.encrypted(topic);
    if (this.wakuMode === WakuMode.Light) {
      WakuLightNodeCore.broadcastMessage(data, customTopic);
    } else {
      WakuRelayNodeCore.broadcastMessage(data, customTopic);
    }
  }

  private static getWakuCore(): Optional<LightNode | RelayNode> {
    return this.wakuMode === WakuMode.Light
      ? WakuLightNodeCore.waku
      : WakuRelayNodeCore.waku;
  }
}
