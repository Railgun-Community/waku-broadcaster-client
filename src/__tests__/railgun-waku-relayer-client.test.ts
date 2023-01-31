import { poll } from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { RelayerConnectionStatus } from '../models/export-models';
import { RailgunWakuRelayerClient } from '../railgun-waku-relayer-client';
import { MOCK_CHAIN } from '../tests/mocks.test';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN;
const wakuDirectPeers: string[] = [];

let currentStatus: RelayerConnectionStatus;
const statusCallback = (status: RelayerConnectionStatus) => {
  currentStatus = status;
};

describe('railgun-waku-relayer-client', () => {
  it('Should start up the client and pull live fees', async () => {
    await RailgunWakuRelayerClient.start(
      chain,
      wakuDirectPeers,
      statusCallback,
    );

    expect(currentStatus).to.equal(RelayerConnectionStatus.Searching);

    // Poll until currentStatus is Connected.
    await poll(
      async () => currentStatus,
      status => status === RelayerConnectionStatus.Connected,
      20,
      10000 / 20, // 10 sec.
    );
  }).timeout(15000);
});
