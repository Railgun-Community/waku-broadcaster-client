import { expect } from 'chai';
import sinon from 'sinon';
import {
  Chain,
  poll,
  BroadcasterConnectionStatus,
  SelectedBroadcaster,
} from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { WakuBroadcasterClient, WakuMode } from '../waku-broadcaster-client.js';
import { BroadcasterOptions } from '../models/index.js';
import { contentTopics } from '../waku/waku-topics.js';
import { WakuLightNodeCore } from '../waku/waku-node/waku-light/waku-light-core.js';
import { WakuRelayNodeCore } from '../waku/waku-node/waku-relay/waku-relay-core.js';
import { MOCK_CHAIN } from '../tests/mocks.test.js';
import { MOCK_TOKEN } from '../tests/mocks.test.js';

chai.use(chaiAsPromised);
const broadcasterOptions: BroadcasterOptions = {};

let currentChain: Chain;
let currentStatus: BroadcasterConnectionStatus;

// NOTE: For example, this would be a frontend recieving the status updates
const statusCallback = (chain: Chain, status: BroadcasterConnectionStatus) => {
  currentChain = chain;
  currentStatus = status;
};

type MockableFunction<T extends (...args: any[]) => any> = T & {
  override: (mock: T) => void;
  clear: () => void;
};

describe('waku-broadcaster-client', () => {
  afterEach(async () => {
    // Stop the client and poller
    await WakuBroadcasterClient.stop();

    sinon.restore();
  });

  // Note: monolithic test avoid spamming too many new client connections in multiple tests
  it('Should start up the client with a failure catch and retry, find best broadcaster, and add transport subscription', async () => {
    // Note: It is not possible to stub waitForRemotePeer due to the nature of stubbing with ES6 modules.
    // ... so we must stub the connect() function itself to fail

    // ***** Try starting the client *****

    // Stub light connect() to fail since its the first connect attempted
    const connectStub = sinon
      .stub(WakuLightNodeCore as any, 'connect')
      .callsFake(async () => {
        await WakuLightNodeCore.disconnect();
        WakuLightNodeCore.connectFailed = true;
        throw new Error('Simulated connect() error');
      });

    // Ensure start fails with waitForRemotePeer error
    await expect(
      WakuBroadcasterClient.start(
        MOCK_CHAIN,
        broadcasterOptions,
        statusCallback,
        {
          log: console.log,
          error: console.error,
        },
      ),
    ).to.be.rejectedWith('Cannot connect to Broadcaster network');

    // Ensure connectFailed is true after connect() fails
    expect(WakuLightNodeCore.connectFailed).to.be.true;

    // Ensure statusCallback has nothing yet
    expect(currentChain).to.be.undefined;
    expect(currentStatus).to.be.undefined;

    // Restore connect() before pollStatus() triggers it again through initWaku()
    connectStub.restore();

    // Start the poller; should update status, see connectedFailed, and run initWaku again
    WakuBroadcasterClient.pollStatus();

    // 1. Wait for pollStatus to updateStatus and see connectFailed
    await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Error,
      50, // wait 50ms between each poll
      10000 / 50, // 10 seconds allowed
    );
    if (
      (currentStatus as BroadcasterConnectionStatus) !==
      BroadcasterConnectionStatus.Error
    ) {
      throw new Error(
        `Should have error in first run of pollStatus, got ${currentStatus}`,
      );
    }

    // Note: Status may be Searching here if fees are not retrieved quickly

    // 2. Wait for waku client to recieve fees and pollStatus to update to Connected
    // Note: Sometimes fails if tests are run often close together. Maybe Waku prevents spamming?
    const statusConnected = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Connected,
      50, // wait 50ms between each poll
      60000 / 50, // 60 seconds allowed
    );
    if (statusConnected !== BroadcasterConnectionStatus.Connected) {
      throw new Error('Could not establish connection with fees.');
    }

    expect(WakuBroadcasterClient.getContentTopics()).to.deep.equal([
      `/railgun/v2/0-${MOCK_CHAIN.id}-fees/json`,
      `/railgun/v2/0-${MOCK_CHAIN.id}-transact-response/json`,
    ]);

    // ***** Try finding best broadcaster *****
    const useRelayAdapt = true;
    const selectedBroadcaster: Optional<SelectedBroadcaster> =
      WakuBroadcasterClient.findBestBroadcaster(
        MOCK_CHAIN,
        MOCK_TOKEN,
        useRelayAdapt,
      );

    expect(selectedBroadcaster).to.be.an('object');
    expect(selectedBroadcaster?.railgunAddress).to.be.a('string');
    expect(selectedBroadcaster?.tokenAddress).to.equal(MOCK_TOKEN);
    expect(
      selectedBroadcaster?.tokenFee.availableWallets,
    ).to.be.greaterThanOrEqual(1);
    expect(selectedBroadcaster?.tokenFee.expiration).to.be.a('number');
    expect(selectedBroadcaster?.tokenFee.feePerUnitGas).to.be.a('string');
    expect(selectedBroadcaster?.tokenFee.feesID).to.be.a('string');
    expect(selectedBroadcaster?.tokenFee.relayAdapt).to.be.a('string');

    // ***** Try adding a transport subscription *****
    const topic = 'test-topic';
    const callback = (message: any) => {
      // Mock callback function
    };

    const formattedTopic = contentTopics.encrypted(topic);
    // input waku is a placeholder, not used in the function here, it is used in waku-transport.
    // need to keep same function abi as waku-transport
    await WakuBroadcasterClient.addTransportSubscription(topic, callback);

    expect(WakuBroadcasterClient.getContentTopics()).to.include(formattedTopic);
  }).timeout(90000);

  // describe('sendTransport', () => {
  //   it('should send transport data', () => {
  //     const data = { message: 'Hello, world!' };
  //     const topic = '/test-topic';

  //     WakuBroadcasterClient.sendTransport(data, topic);

  //     // check if the WakuBroadcasterWakuCore.waku.relay.send method was called

  //   });
  // });
});
