import chai from 'chai';
import { BroadcasterFeeCache } from '../../fees/broadcaster-fee-cache.js';
import { BroadcasterConfig } from '../../models/broadcaster-config.js';
import { AddressFilter } from '../../filters/address-filter.js';
import { BroadcasterSearch } from '../best-broadcaster.js';
import { MOCK_CHAIN_ETHEREUM } from '../../tests/mocks.test.js';

const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;
const tokenAddress = '0x1234567890123456789012345678901234567890';
const trustedSigner = '0xTrustedSigner';
const broadcaster1 = '0xBroadcaster1';
const broadcaster2 = '0xBroadcaster2';
const broadcaster3 = '0xBroadcaster3';

describe('best-broadcaster', () => {
  before(() => {
    BroadcasterConfig.trustedFeeSigner = trustedSigner;
  });

  beforeEach(() => {
    (BroadcasterFeeCache as any).cache = { forNetwork: {} };
    (BroadcasterFeeCache as any).authorizedFees = {};
    (BroadcasterFeeCache as any).averageAuthorizedFees = {};
    AddressFilter.setAllowlist(undefined);
    AddressFilter.setBlocklist(undefined);
  });

  it('Should filter broadcasters based on authorized fees', () => {
    const authorizedFeeAmount = 100n;
    // Lower 10% -> 90
    // Upper 30% -> 130

    // Add authorized fee
    BroadcasterFeeCache.addAuthorizedFees(trustedSigner, {
      [tokenAddress]: {
        feePerUnitGas: authorizedFeeAmount.toString(),
        expiration: Date.now() + 100000,
        feesID: '1',
        availableWallets: 1,
        relayAdapt: '0x',
        reliability: 1,
      },
    });

    // Broadcaster 1: Within range (100)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '100',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    // Broadcaster 2: Too low (89)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster2,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '89',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    // Broadcaster 3: Too high (131)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster3,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '131',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(1);
    expect(broadcasters?.[0].railgunAddress).to.equal(broadcaster1);
  });

  it('Should return NO broadcasters if no authorized fee exists (default)', () => {
    // Broadcaster 1: 100
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '100',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(0);
  });

  it('Should return all broadcasters if no authorized fee exists AND ignoreMissingAuthorizedFee is true', () => {
    // Broadcaster 1: 100
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '100',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true, // ignoreMissingAuthorizedFee
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(1);
  });

  it('Should include broadcasters with fees exactly at the boundaries', () => {
    const authorizedFeeAmount = 100n;
    const minFee = 90n; // 10% lower
    const maxFee = 130n; // 30% upper

    // Add authorized fee
    BroadcasterFeeCache.addAuthorizedFees(trustedSigner, {
      [tokenAddress]: {
        feePerUnitGas: authorizedFeeAmount.toString(),
        expiration: Date.now() + 100000,
        feesID: '1',
        availableWallets: 1,
        relayAdapt: '0x',
        reliability: 1,
      },
    });

    // Broadcaster 1: Min fee (90)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: minFee.toString(),
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    // Broadcaster 2: Max fee (130)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster2,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: maxFee.toString(),
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(2);
    const addresses = broadcasters?.map(b => b.railgunAddress);
    expect(addresses).to.include(broadcaster1);
    expect(addresses).to.include(broadcaster2);
  });

  it('Should exclude broadcasters with fees just outside the boundaries', () => {
    const authorizedFeeAmount = 100n;
    const minFee = 90n; // 10% lower
    const maxFee = 130n; // 30% upper

    // Add authorized fee
    BroadcasterFeeCache.addAuthorizedFees(trustedSigner, {
      [tokenAddress]: {
        feePerUnitGas: authorizedFeeAmount.toString(),
        expiration: Date.now() + 100000,
        feesID: '1',
        availableWallets: 1,
        relayAdapt: '0x',
        reliability: 1,
      },
    });

    // Broadcaster 1: Just below min (89)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: (minFee - 1n).toString(),
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    // Broadcaster 2: Just above max (131)
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster2,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: (maxFee + 1n).toString(),
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(0);
  });

  it('Should return all broadcasters if trustedFeeSigner is not configured', () => {
    // Unset trusted signer
    const originalTrustedSigner = BroadcasterConfig.trustedFeeSigner;
    // @ts-ignore
    BroadcasterConfig.trustedFeeSigner = undefined;

    // Broadcaster 1: 100
    BroadcasterFeeCache.addTokenFees(
      chain,
      broadcaster1,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas: '100',
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability: 1,
        },
      },
      'id1',
      '8.0.0',
      [],
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(1);

    // Restore trusted signer
    BroadcasterConfig.trustedFeeSigner = originalTrustedSigner;
  });
});
