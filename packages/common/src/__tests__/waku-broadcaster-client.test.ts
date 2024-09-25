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
import { MOCK_CHAIN_ETHEREUM, MOCK_CHAIN_GOERLI } from '../tests/mocks.test.js';
import { WakuBroadcasterWakuCore } from '../waku/waku-broadcaster-waku-core.js';
import { BroadcasterOptions } from '../models/index.js';
import { LightNode } from '@waku/sdk';
import { contentTopics } from '../waku/waku-topics.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;

const broadcasterOptions: BroadcasterOptions = {};

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const WETH_ADDRESS_GOERLI = '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6';
const CURRENT_TEST_TOKEN = WETH_ADDRESS;

let currentChain: Chain;
let currentStatus: BroadcasterConnectionStatus;
const statusCallback = (chain: Chain, status: BroadcasterConnectionStatus) => {
  currentChain = chain;
  currentStatus = status;
};

describe('waku-broadcaster-client', () => {
  after(async () => {
    await WakuBroadcasterClient.stop();
  });

  it('Should start up the client, pull live fees and find best Broadcaster, then error and reconnect', async () => {
    WakuBroadcasterClient.pollDelay = 500;

    await WakuBroadcasterClient.start(
      chain,
      broadcasterOptions,
      statusCallback,
    );

    expect(currentChain).to.deep.equal(chain);
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
        chain,
        CURRENT_TEST_TOKEN,
        useRelayAdapt,
      );

    expect(selectedBroadcaster).to.be.an('object');
    expect(selectedBroadcaster?.railgunAddress).to.be.a('string');
    expect(selectedBroadcaster?.tokenAddress).to.equal(CURRENT_TEST_TOKEN);
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
      20,
      20000 / 20, // 20 sec.
    );
    if (statusConnected !== BroadcasterConnectionStatus.Connected) {
      throw new Error(
        `Should be re-connected after disconnection, got ${currentStatus}`,
      );
    }

    // expect(
    //   WakuBroadcasterClient.getMeshPeerCount(),
    // ).to.be.greaterThanOrEqual(1);

    await WakuBroadcasterClient.setChain(MOCK_CHAIN_GOERLI);
    expect(WakuBroadcasterClient.getContentTopics()).to.deep.equal([
      '/railgun/v2/0/5/fees/json',
      '/railgun/v2/0/5/transact-response/json',
    ]);
  }).timeout(90000);

  describe('addTransportSubscription', () => {
    it('should add a transport subscription', async () => {
      const waku: LightNode = {} as LightNode; // Mock LightNode object
      const topic = '/test-topic';
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
