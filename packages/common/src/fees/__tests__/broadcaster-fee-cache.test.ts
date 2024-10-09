/// <reference types="../../types/index.js" />
import { CachedTokenFee } from '@railgun-community/shared-models';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  MOCK_CHAIN,
  MOCK_CHAIN_SEPOLIA,
  MOCK_TOKEN,
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

const tokenAddress = MOCK_TOKEN;
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
  beforeEach(() => {
    BroadcasterFeeCache.resetCache(MOCK_CHAIN);
  });

  after(() => {
    BroadcasterFeeCache.resetCache(MOCK_CHAIN);
  });

  it('Should return broadcaster-fee-cache initial state', () => {
    BroadcasterFeeCache.init(['test_list']);

    // NOTE: cache is private so this is a hack to compare it
    // @ts-ignore
    expect(BroadcasterFeeCache.cache).to.deep.equal(initialState);

    expect(BroadcasterFeeCache.feesForChain(MOCK_CHAIN)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for bad broadcaster versions', () => {
    BroadcasterFeeCache.addTokenFees(
      MOCK_CHAIN,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '3.99', // too low
      ['test_list'],
    );

    BroadcasterFeeCache.addTokenFees(
      MOCK_CHAIN,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '10.0.0', // too high
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(MOCK_CHAIN)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for incorrect MOCK_CHAIN', () => {
    BroadcasterFeeCache.addTokenFees(
      { id: 11115555, type: 0 }, // Sepolia
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '7.22',
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(MOCK_CHAIN)).to.equal(undefined);
  });

  it('Should not update broadcaster fees for invalid list keys', () => {
    BroadcasterFeeCache.addTokenFees(
      MOCK_CHAIN,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '7.22',
      ['test_list_INVALID'],
    );

    expect(BroadcasterFeeCache.feesForChain(MOCK_CHAIN)).to.equal(undefined);
  });

  it('Should update broadcaster fees for MOCK_CHAIN', () => {
    BroadcasterFeeCache.addTokenFees(
      MOCK_CHAIN,
      railgunAddress,
      feeExpiration,
      tokenFeeMap,
      identifier,
      '7.2.2.99', // version
      ['test_list'],
    );

    expect(BroadcasterFeeCache.feesForChain(MOCK_CHAIN)).to.deep.equal({
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
    // NOTE: Different chain used here because when start test fails, this also seems to fail
    // Something is linked between the 2 tests and not clearing if same chain is used
    const sepolia = MOCK_CHAIN_SEPOLIA;

    BroadcasterFeeCache.addTokenFees(
      sepolia,
      railgunAddress,
      feeExpiration,
      tokenFeeMap2,
      identifier,
      '7.2.2.99', // version
      ['test_list'],
    );
    BroadcasterFeeCache.addTokenFees(
      sepolia,
      railgunAddress2,
      feeExpiration,
      tokenFeeMap3,
      'def',
      '7.2.2.99', // version
      ['test_list'],
    );

    const broadcasters = BroadcasterSearch.findAllBroadcastersForChain(
      sepolia,
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
