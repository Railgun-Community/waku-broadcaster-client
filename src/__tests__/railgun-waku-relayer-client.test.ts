import { delay } from '@railgun-community/shared-models';
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
  console.log(status);
  currentStatus = status;
};

describe('railgun-waku-relayer-client', () => {
  before(async () => {});

  afterEach(() => {});

  after(() => {});

  it('Should start up the client and pull live fees', async () => {
    await RailgunWakuRelayerClient.start(
      chain,
      wakuDirectPeers,
      statusCallback,
    );

    await delay(5000);

    expect(currentStatus).to.equal(RelayerConnectionStatus.Connected);
  });
});
