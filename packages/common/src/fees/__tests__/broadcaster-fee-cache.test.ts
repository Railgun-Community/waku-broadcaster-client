/// <reference types="../../types/index.js" />
import {
  CachedTokenFee,
  type SelectedBroadcaster,
} from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  MOCK_CHAIN_ETHEREUM,
  MOCK_CHAIN_GOERLI,
} from '../../tests/mocks.test.js';
import {
  BroadcasterFeeCache,
  BroadcasterFeeCacheState,
} from '../broadcaster-fee-cache.js';

import { BroadcasterSearch } from '../../search/best-broadcaster.js';

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
  reliability: 0.99,
};
const cachedTokenFee2 = {
  ...cachedTokenFee,
  expiration: Date.now() + 100000,
  reliability: 0.9,
};
const cachedTokenFee3 = {
  ...cachedTokenFee,
  expiration: Date.now() + 100000,
  reliability: 0.99,
};
const tokenFeeMap: MapType<CachedTokenFee> = {
  [tokenAddress]: cachedTokenFee,
};
const railgunAddress = '1234';
const tokenFeeMap2: MapType<CachedTokenFee> = {
  [tokenAddress]: cachedTokenFee2,
};
const tokenFeeMap3: MapType<CachedTokenFee> = {
  [tokenAddress]: cachedTokenFee3,
};
const railgunAddress2 = '5679';
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
      '10.0.0', // too high
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
      '6.22',
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
      '6.22',
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
      '6.2.2.99', // version
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

  it('Should sort broadcasters by reliability', () => {
    const mockChain = MOCK_CHAIN_GOERLI;
    BroadcasterFeeCache.resetCache(mockChain);
    BroadcasterFeeCache.addTokenFees(
      mockChain,
      railgunAddress,
      feeExpiration,
      tokenFeeMap2,
      identifier,
      '6.2.2.99', // version
      ['test_list'],
    );
    BroadcasterFeeCache.addTokenFees(
      mockChain,
      railgunAddress2,
      feeExpiration,
      tokenFeeMap3,
      'def',
      '6.2.2.99', // version
      ['test_list'],
    );

    const broadcasters = BroadcasterSearch.findAllBroadcastersForChain(
      mockChain,
      false,
    );

    const expected = [
      {
        railgunAddress: railgunAddress2,
        tokenFee: tokenFeeMap3[tokenAddress],
        tokenAddress: tokenAddress,
      },
      {
        railgunAddress: railgunAddress,
        tokenFee: tokenFeeMap2[tokenAddress],
        tokenAddress: tokenAddress,
      },
    ];
    expect(broadcasters).to.deep.equal(expected);
  });
});
