import { BroadcasterFeeMessageData } from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon, { SinonStub } from 'sinon';
import {
  MOCK_CHAIN_ETHEREUM,
} from '../../tests/mocks.test.js';
import { handleAuthorizedFees } from '../handle-authorized-fees-message.js';
import { BroadcasterFeeCache } from '../broadcaster-fee-cache.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;

const validTimestamp = new Date();
const fees = { '0x1234': '100' }; // Fee 100
const validExpiration = Date.now() + 1000000;
const feesID = 'abc';
const identifier = 'ID1';
const availableWallets = 2;
const version = '8.1.0';
const relayAdapt = '0xabcd';

let validFeeMessageData: BroadcasterFeeMessageData;

let broadcasterFeeCacheStub: SinonStub;

describe('handle-authorized-fees', function () {
  this.timeout(60000);

  before(async () => {
    validFeeMessageData = {
      fees,
      feeExpiration: validExpiration,
      feesID,
      railgunAddress: '0x1234567890123456789012345678901234567890',
      identifier,
      availableWallets,
      version,
      relayAdapt,
      requiredPOIListKeys: [],
      reliability: 1,
    };
  });

  beforeEach(() => {
    broadcasterFeeCacheStub = sinon.stub(BroadcasterFeeCache, 'addAuthorizedFees');
  });

  afterEach(() => {
    broadcasterFeeCacheStub.restore();
  });

  it('Should handle valid authorized fees message', async () => {
    handleAuthorizedFees(validFeeMessageData, validFeeMessageData.railgunAddress);

    const expectedFees = {
      '0x1234': {
        feePerUnitGas: fees['0x1234'],
        expiration: validExpiration,
        feesID,
        availableWallets,
        relayAdapt,
        reliability: 1,
      },
    };

    expect(broadcasterFeeCacheStub.calledOnce).to.be.true;
    expect(broadcasterFeeCacheStub.firstCall.args[0]).to.equal(
      validFeeMessageData.railgunAddress,
    );
    expect(broadcasterFeeCacheStub.firstCall.args[1]).to.deep.equal(
      expectedFees,
    );
  });
});
