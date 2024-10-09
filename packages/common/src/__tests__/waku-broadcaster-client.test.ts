/// <reference types="../types/index.js" />
import {
  Chain,
  poll,
  BroadcasterConnectionStatus,
  SelectedBroadcaster,
} from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { WakuBroadcasterClient } from '../waku-broadcaster-client.js';
import { WakuBroadcasterWakuCore } from '../waku/waku-broadcaster-waku-core.js';
import { BroadcasterOptions } from '../models/index.js';
import { LightNode } from '@waku/sdk';
import { contentTopics } from '../waku/waku-topics.js';
import { TESTS_CHAIN, TESTS_TOKEN } from '../models/constants.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const broadcasterOptions: BroadcasterOptions = {};

let currentChain: Chain;
let currentStatus: BroadcasterConnectionStatus;
const statusCallback = (
  TESTS_CHAIN: Chain,
  status: BroadcasterConnectionStatus,
) => {
  currentChain = TESTS_CHAIN;
  currentStatus = status;
};

describe('waku-broadcaster-client', () => {
  after(async () => {
    await WakuBroadcasterClient.stop();
  });

  it('Should start up the client, pull live fees and find best Broadcaster, then error and reconnect', async () => {
    WakuBroadcasterClient.pollDelay = 500;

    await WakuBroadcasterClient.start(
      TESTS_CHAIN,
      broadcasterOptions,
      statusCallback,
      {
        log: console.log,
        error: console.error,
      },
    );

    expect(currentChain).to.deep.equal(TESTS_CHAIN);
    expect(currentStatus).to.equal(BroadcasterConnectionStatus.Searching);

    // Poll until currentStatus is Connected.
    const statusInitialConnection = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Connected,
      20, // delayInMS
      60000 / 20, // number of attempts corresponding to 60 sec.
    );
    if (statusInitialConnection !== BroadcasterConnectionStatus.Connected) {
      throw new Error('Could not establish initial connection with fees.');
    }

    const useRelayAdapt = true;
    const selectedBroadcaster: Optional<SelectedBroadcaster> =
      WakuBroadcasterClient.findBestBroadcaster(
        TESTS_CHAIN,
        TESTS_TOKEN,
        useRelayAdapt,
      );

    expect(selectedBroadcaster).to.be.an('object');
    expect(selectedBroadcaster?.railgunAddress).to.be.a('string');
    expect(selectedBroadcaster?.tokenAddress).to.equal(TESTS_TOKEN);
    expect(
      selectedBroadcaster?.tokenFee.availableWallets,
    ).to.be.greaterThanOrEqual(1);
    expect(selectedBroadcaster?.tokenFee.expiration).to.be.a('number');
    expect(selectedBroadcaster?.tokenFee.feePerUnitGas).to.be.a('string');
    expect(selectedBroadcaster?.tokenFee.feesID).to.be.a('string');
    expect(selectedBroadcaster?.tokenFee.relayAdapt).to.be.a('string');

    // Set error state in order to test status and reconnect.
    WakuBroadcasterWakuCore.hasError = true;

    // Poll until currentStatus is Error.
    const statusError = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Error,
      20,
      1000 / 20, // 1 sec.
    );
    if (statusError !== BroadcasterConnectionStatus.Error) {
      throw new Error(`Should be error, got ${currentStatus}`);
    }

    // Poll until currentStatus is Disconnected.
    const statusDisconnected = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Disconnected,
      20,
      2000 / 20, // 2 sec.
    );
    if (statusDisconnected !== BroadcasterConnectionStatus.Disconnected) {
      throw new Error(`Should be disconnected, got ${currentStatus}`);
    }

    // Poll until currentStatus is Connected.
    const statusConnected = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Connected,
      40,
      40000 / 40, // 20 sec.
    );
    if (statusConnected !== BroadcasterConnectionStatus.Connected) {
      throw new Error(
        `Should be re-connected after disconnection, got ${currentStatus}`,
      );
    }

    // expect(
    //   WakuBroadcasterClient.getMeshPeerCount(),
    // ).to.be.greaterThanOrEqual(1);

    await WakuBroadcasterClient.setChain(TESTS_CHAIN);
    expect(WakuBroadcasterClient.getContentTopics()).to.deep.equal([
      '/railgun/v2/0-5-fees/json',
      '/railgun/v2/0-5-transact-response/json',
    ]);
  }).timeout(90000);

  describe('addTransportSubscription', () => {
    it('should add a transport subscription', async () => {
      const waku: LightNode = {} as LightNode; // Mock LightNode object
      const topic = 'test-topic';
      const callback = (message: any) => {
        // Mock callback function
      };

      const formattedTopic = contentTopics.encrypted(topic);
      // input waku is a placeholder, not used in the function here, it is used in waku-transport.
      // need to keep same function abi as waku-transport
      await WakuBroadcasterClient.addTransportSubscription(
        waku,
        topic,
        callback,
      );

      expect(WakuBroadcasterClient.getContentTopics()).to.include(
        formattedTopic,
      );
    });
  });

  // describe('sendTransport', () => {
  //   it('should send transport data', () => {
  //     const data = { message: 'Hello, world!' };
  //     const topic = '/test-topic';

  //     WakuBroadcasterClient.sendTransport(data, topic);

  //     // check if the WakuBroadcasterWakuCore.waku.relay.send method was called

  //   });
  // });
});
