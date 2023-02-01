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

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN;
const wakuDirectPeers: string[] = [];

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

let currentChain: Chain;
let currentStatus: RelayerConnectionStatus;
const statusCallback = (chain: Chain, status: RelayerConnectionStatus) => {
  currentChain = chain;
  currentStatus = status;
};

describe('railgun-waku-relayer-client', () => {
  it('Should start up the client, pull live fees and find best Relayer', async () => {
    await RailgunWakuRelayerClient.start(
      chain,
      wakuDirectPeers,
      statusCallback,
    );

    expect(currentChain).to.deep.equal(chain);
    expect(currentStatus).to.equal(RelayerConnectionStatus.Searching);

    // Poll until currentStatus is Connected.
    await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Connected,
      20,
      20000 / 20, // 20 sec.
    );

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
  }).timeout(20000);
});
