/// <reference types="../types/index" />
import {
  Chain,
  poll,
  RelayerConnectionStatus,
  SelectedRelayer,
} from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { RailgunWakuRelayerClient } from '../railgun-waku-relayer-client';
import { MOCK_CHAIN } from '../tests/mocks.test';
import { WakuRelayerWakuCore } from '../waku/waku-relayer-waku-core';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN;
const wakuDirectPeers: string[] = [
  '/dns4/relayer.crabdance.com/tcp/8000/wss/p2p/16Uiu2HAm9TiCU9ZRPoKMUyo6QQvZTSceSH5ZtX6u353NHgVCtr1W',
  '/dns4/relayer.chickenkiller.com/tcp/8000/wss/p2p/16Uiu2HAmNy49QzXVWHMdhz7DQHXCpk9sHvVua99j3QcShUK8PVSD',
];

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

let currentChain: Chain;
let currentStatus: RelayerConnectionStatus;
const statusCallback = (chain: Chain, status: RelayerConnectionStatus) => {
  currentChain = chain;
  currentStatus = status;
};

describe('railgun-waku-relayer-client', () => {
  after(async () => {
    await RailgunWakuRelayerClient.stop();
  });

  it('Should start up the client, pull live fees and find best Relayer, then error and reconnect', async () => {
    RailgunWakuRelayerClient.pollDelay = 500;

    await RailgunWakuRelayerClient.start(
      chain,
      wakuDirectPeers,
      statusCallback,
    );

    expect(currentChain).to.deep.equal(chain);
    expect(currentStatus).to.equal(RelayerConnectionStatus.Searching);

    // Poll until currentStatus is Connected.
    const statusInitialConnection = await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Connected,
      20,
      20000 / 20, // 20 sec.
    );
    if (!statusInitialConnection) {
      throw new Error('Could not establish initial connection with fees.');
    }

    const useRelayAdapt = true;
    const selectedRelayer: Optional<SelectedRelayer> =
      RailgunWakuRelayerClient.findBestRelayer(
        chain,
        WETH_ADDRESS,
        useRelayAdapt,
      );

    expect(selectedRelayer).to.be.an('object');
    expect(selectedRelayer?.railgunAddress).to.be.a('string');
    expect(selectedRelayer?.tokenAddress).to.equal(WETH_ADDRESS);
    expect(selectedRelayer?.tokenFee.availableWallets).to.be.greaterThanOrEqual(
      1,
    );
    expect(selectedRelayer?.tokenFee.expiration).to.be.a('number');
    expect(selectedRelayer?.tokenFee.feePerUnitGas).to.be.a('string');
    expect(selectedRelayer?.tokenFee.feesID).to.be.a('string');
    expect(selectedRelayer?.tokenFee.relayAdapt).to.be.a('string');

    // Set error state in order to test status and reconnect.
    WakuRelayerWakuCore.hasError = true;

    // Poll until currentStatus is Error.
    const statusError = await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Error,
      20,
      1000 / 20, // 1 sec.
    );
    if (!statusError) {
      throw new Error(`Should be error, got ${currentStatus}`);
    }

    // Poll until currentStatus is Disconnected.
    const statusDisconnected = await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Disconnected,
      20,
      2000 / 20, // 2 sec.
    );
    if (!statusDisconnected) {
      throw new Error(`Should be disconnected, got ${currentStatus}`);
    }

    // Poll until currentStatus is Connected.
    const statusConnected = await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Connected,
      20,
      20000 / 20, // 20 sec.
    );
    if (!statusConnected) {
      throw new Error(
        `Should be re-connected after disconnection, got ${currentStatus}`,
      );
    }
  }).timeout(60000);
});
