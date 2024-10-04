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
import { LightNode, Protocols, waitForRemotePeer, waku } from '@waku/sdk';
import { contentTopics } from './waku/waku-topics.js';

export class WakuBroadcasterClient {
  static pollDelay = 6000;
  static noPeersFoundCounter = 0;

  private static chain: Chain;
  private static statusCallback: BroadcasterConnectionStatusCallback;
  private static started = false;

  static async start(
    chain: Chain,
    broadcasterOptions: BroadcasterOptions,
    statusCallback: BroadcasterConnectionStatusCallback,
    broadcasterDebugger?: BroadcasterDebugger,
  ) {
    if (broadcasterDebugger) {
      BroadcasterDebug.setDebugger(broadcasterDebugger);
    }

    BroadcasterDebug.log('Starting Waku Broadcaster Client...');

    this.chain = chain;
    this.statusCallback = statusCallback;

    console.log(
      'Passing in broadcasterOptions to WakuBroadcasterWakuCore.setBroadcasterOptions',
    );
    WakuBroadcasterWakuCore.setBroadcasterOptions(broadcasterOptions);

    BroadcasterDebug.log('Initializing Broadcaster Fee Cache...');
    BroadcasterFeeCache.init(
      broadcasterOptions.poiActiveListKeys ??
        POI_REQUIRED_LISTS.map(list => list.key),
    );

    try {
      this.started = false;
      BroadcasterDebug.log('Initializing Waku Client...');

      await WakuBroadcasterWakuCore.initWaku(chain);
      this.started = true;

      // Update the status
      this.updateStatus();
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw new Error('Unexpected non-error thrown', { cause });
      }
      throw new Error('Cannot connect to Broadcaster network.', { cause });
    }
  }

  // Only used in testing
  static async stop() {
    await WakuBroadcasterWakuCore.disconnect();
    this.started = false;
    this.updateStatus();
  }

  static isStarted() {
    return this.started;
  }

  static async updateChain(chain: Chain): Promise<void> {
    // Check that waku instance is initialized
    if (!WakuBroadcasterWakuCore.waku) {
      BroadcasterDebug.log('No waku instance found in updateChain');
      return;
    }

    // Set chain in client
    this.chain = chain;

    // Set new observers, don't worry about a peer until performing tx
    await WakuObservers.setObserversForChain(
      WakuBroadcasterWakuCore.waku,
      chain,
    );

    // Update status whether peer connection error or not
    this.updateStatus();
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

  static getLightPushPeerCount(): number {
    return WakuBroadcasterWakuCore.getLightPushPeerCount();
  }

  static getFilterPeerCount(): number {
    return WakuBroadcasterWakuCore.getFilterPeerCount();
  }
  /**
   * The function `findBestBroadcaster` finds the broadcaster with the lowest fees for a given chain and token.
   * @param {Chain} chain - The `chain` parameter is a Chain object that represents the network to find a broadcaster for.
   * @param {string} tokenAddress - The `tokenAddress` parameter is a string that represents the
   * address of an ERC20 Token on the network, a broadcaster broadcasting fees for WakuBroadcasterClient token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedBroadcaster> object.
   */
  static findBestBroadcaster(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster> {
    if (!this.started) {
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
    if (!this.started) {
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
   * address of an ERC20 Token on the network, a broadcaster broadcasting fees for WakuBroadcasterClient token will be selected.
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
    if (!this.started) {
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
   * address of an ERC20 Token on the network; a broadcaster broadcasting fees for WakuBroadcasterClient token will be selected.
   * @param {boolean} useRelayAdapt - A boolean value indicating whether to select broadcasters that
   * support RelayAdapt transactions.
   * @returns an Optional<SelectedBroadcaster[]> object.
   */
  static findBroadcastersForToken(
    chain: Chain,
    tokenAddress: string,
    useRelayAdapt: boolean,
  ): Optional<SelectedBroadcaster[]> {
    if (!this.started) {
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

  /**
   * Start keep-alive poller which checks Broadcaster status every few seconds.
   */
  static async pollStatus() {
    // Avoid stack overflow
    while (true) {
      BroadcasterDebug.log(
        '********** Polling broadcaster status... **********',
      );

      // Log the peers (use the same connectedPeers value used by waitForRemotePeer())
      const peers = WakuBroadcasterWakuCore.getFilterPeerCount();
      console.log(`Connected peers: ${peers}`);

      // Check that the waku instance is initialized
      if (!WakuBroadcasterWakuCore.waku) {
        BroadcasterDebug.log('No waku instance found in poller');

        // Delay and try again
        await delay(this.pollDelay);
        continue; // Restart the loop
      }

      // Check that a chain has been set in WakuObservers
      if (!WakuObservers.getCurrentChain()) {
        BroadcasterDebug.log('No current chain set in WakuObservers yet');

        // Delay and try again
        await delay(this.pollDelay);
        continue; // Restart the loop
      }

      // Check if loop has found no peers 10 times, if so wait for remote peer (hopefully sends some reconnect signal)
      if (this.noPeersFoundCounter > 9) {
        BroadcasterDebug.log(
          'No peers found after 10 loops, waiting for remote peer...',
        );

        try {
          // If we get a peer, let the poller continue through the logic
          await waitForRemotePeer(
            WakuBroadcasterWakuCore.waku,
            [Protocols.Filter, Protocols.LightPush],
            WakuBroadcasterWakuCore.peerDiscoveryTimeout,
          );
        } catch (err) {
          // If no peer after waiting, update the status and continue polling again
          BroadcasterDebug.log(`Error waiting for remote peer: ${err.message}`);

          // Poller should see the status is hasError and callback the errored status
          WakuBroadcasterWakuCore.hasError = true;

          // Reset the counter
          this.noPeersFoundCounter = 0;

          // Delay and try again
          this.updateStatus(); // if waitForRemotePeer() fails, this sees the .hasError status it sets
          await delay(this.pollDelay);
          continue; // Restart the loop
        }

        // Reset the counter
        this.noPeersFoundCounter = 0;
      }

      // If no connected peers found, increment the counter
      if (peers === 0) {
        BroadcasterDebug.log(
          `No pubsub peers found. noPeersFoundCounter: ${this.noPeersFoundCounter}`,
        );
        this.noPeersFoundCounter += 1;

        // Allow the loop to move on and ping subscriptions if they exist
      } else {
        // Reset the counter if peers ever exist, so the retry peer logic only kicks in after 10 consecutive failures
        this.noPeersFoundCounter = 0;
      }

      // Ping pubsubSubscription to keep it alive
      const pubsubSubscription = WakuObservers.getCurrentPubsubSubscription();

      // Ping the pubsubSubscription to keep it alive, and resubscribe contentTopics if needed
      if (!pubsubSubscription) {
        BroadcasterDebug.log('No subscriptions found in poller');

        // Delay and try again
        this.updateStatus(); // if waitForRemotePeer() fails, this will push the .hasError status
        await delay(this.pollDelay);
        continue; // Restart the loop
      } else {
        try {
          await pubsubSubscription.ping();
        } catch (error) {
          BroadcasterDebug.log('Error pinging subscription:');

          if (
            // Check if the error message includes "peer has no subscriptions"
            error instanceof Error &&
            error.message.includes('peer has no subscriptions')
          ) {
            BroadcasterDebug.log('Attempting to resubscribe...');

            // Resubscribe all topics if the peer has no subscriptions
            await WakuObservers.setObserversForChain(
              WakuBroadcasterWakuCore.waku,
              this.chain,
            );
          } else {
            // Continue through the for loop to the next subscription
            BroadcasterDebug.log('Unexpected error when pinging subscription:');
          }
        }
      }

      // Update the status with the latest information from the subscriptions
      this.updateStatus();

      // Delay before recursive poller call
      await delay(this.pollDelay);
    }
  }

  static updateStatus(): BroadcasterConnectionStatus {
    BroadcasterDebug.log('Updating status...');

    const status = BroadcasterStatus.getBroadcasterConnectionStatus(this.chain);

    this.statusCallback(this.chain, status);

    return status;
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
