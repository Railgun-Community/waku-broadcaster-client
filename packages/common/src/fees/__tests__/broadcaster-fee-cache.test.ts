/// <reference types="../../types/index.js" />
import { CachedTokenFee } from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCK_CHAIN_ETHEREUM } from '../../tests/mocks.test.js';
import {
  BroadcasterFeeCache,
  BroadcasterFeeCacheState,
} from '../broadcaster-fee-cache.js';

chai.use(chaiAsPromised);
const { expect } = chai;

const initialState: BroadcasterFeeCacheState = {
  forNetwork: {},
};

const chain = MOCK_CHAIN_ETHEREUM;

const tokenAddress = '0x1234567890';
const cachedTokenFee: CachedTokenFee = {
  feePerUnitGas: '0x01',
  expiration: 10000,
  feesID: 'ID',
  availableWallets: 2,
  relayAdapt: '0x4567',
};
const tokenFeeMap: MapType<CachedTokenFee> = {
  [tokenAddress]: cachedTokenFee,
};
const railgunAddress = '1234';
const identifier = 'abc';
const feeExpiration = Date.now() + 10000000;

describe('broadcaster-fee-cache', () => {
  it('Should return broadcaster-fee-cache initial state', () => {
    BroadcasterFeeCache.init(['test_list']);
    BroadcasterFeeCache.resetCache(chain);

    // @ts-ignore
    expect(BroadcasterFeeCache.cache).to.deep.equal(initialState);

    expect(BroadcasterFeeCache.feesForChain(chain)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for bad broadcaster versions', () => {
    BroadcasterFeeCache.resetCache(chain);

    BroadcasterFeeCache.addTokenFees(
      chain,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '3.99', // too low
      ['test_list'],
    );

    BroadcasterFeeCache.addTokenFees(
      chain,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '6.0.0', // too high
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(chain)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for incorrect chain', () => {
    BroadcasterFeeCache.resetCache(chain);

    BroadcasterFeeCache.addTokenFees(
      { ...MOCK_CHAIN_ETHEREUM, id: 2 },
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '5.22',
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(chain)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for invalid list keys', () => {
    BroadcasterFeeCache.resetCache(chain);

    BroadcasterFeeCache.addTokenFees(
      chain,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '5.22',
      ['test_list_INVALID'],
    );

    expect(BroadcasterFeeCache.feesForChain(chain)).to.equal(undefined);
  });

  it('Should update broadcaster fees for chain', () => {
    BroadcasterFeeCache.resetCache(chain);

    BroadcasterFeeCache.addTokenFees(
      chain,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '5.2.2.99', // version
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(chain)).to.deep.equal({
      forToken: {
        [tokenAddress]: {
          forBroadcaster: {
            [railgunAddress]: {
              forIdentifier: { [identifier]: cachedTokenFee },
            },
          },
        },
      },
    });
  });
});
