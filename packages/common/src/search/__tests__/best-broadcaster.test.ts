import { RailgunEngine } from '@railgun-community/engine';
import { Chain } from '@railgun-community/shared-models';
import chai from 'chai';
import { BroadcasterFeeCache } from '../../fees/broadcaster-fee-cache.js';
import { BroadcasterConfig } from '../../models/broadcaster-config.js';
import { AddressFilter } from '../../filters/address-filter.js';
import { BroadcasterSearch } from '../best-broadcaster.js';
import {
  MOCK_CHAIN_ETHEREUM,
  MOCK_CHAIN_POLYGON,
  MOCK_RAILGUN_WALLET_ADDRESS,
} from '../../tests/mocks.test.js';

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
    BroadcasterFeeCache.init([]);
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

describe('best-broadcaster-payee-dedupe', () => {
  const baseAddressData = RailgunEngine.decodeAddress(
    MOCK_RAILGUN_WALLET_ADDRESS,
  );

  // Same payee (master public key), different viewing key.
  const sameMasterPublicKeyAddress = (viewingKeyByte: number) =>
    RailgunEngine.encodeAddress({
      ...baseAddressData,
      viewingPublicKey: new Uint8Array(32).fill(viewingKeyByte),
    });

  // Same payee, different networkID embedded in the address.
  const sameMasterPublicKeyAddressForChain = (addressChain: Optional<Chain>) =>
    RailgunEngine.encodeAddress({
      ...baseAddressData,
      chain: addressChain,
    });

  // A genuinely different payee.
  const otherMasterPublicKeyAddress = (masterPublicKey: bigint) =>
    RailgunEngine.encodeAddress({ ...baseAddressData, masterPublicKey });

  const addFee = (
    railgunAddress: string,
    identifier: string,
    feePerUnitGas: string,
    reliability = 1,
  ) => {
    BroadcasterFeeCache.addTokenFees(
      chain,
      railgunAddress,
      Date.now() + 100000,
      {
        [tokenAddress]: {
          feePerUnitGas,
          expiration: Date.now() + 100000,
          feesID: '1',
          availableWallets: 1,
          relayAdapt: '0x',
          reliability,
        },
      },
      identifier,
      '8.0.0',
      [],
    );
  };

  let originalTrustedSigner: string | string[];

  before(() => {
    originalTrustedSigner = BroadcasterConfig.trustedFeeSigner;
    // @ts-ignore
    BroadcasterConfig.trustedFeeSigner = undefined;
  });

  after(() => {
    BroadcasterConfig.trustedFeeSigner = originalTrustedSigner;
  });

  beforeEach(() => {
    BroadcasterFeeCache.init([]);
    (BroadcasterFeeCache as any).cache = { forNetwork: {} };
    (BroadcasterFeeCache as any).authorizedFees = {};
    (BroadcasterFeeCache as any).averageAuthorizedFees = {};
    AddressFilter.setAllowlist(undefined);
    AddressFilter.setBlocklist(undefined);
  });

  it('Should collapse identifier spam from one address into a single entry', () => {
    // 50 announcements, same address, different identifiers.
    for (let i = 0; i < 50; i += 1) {
      addFee(MOCK_RAILGUN_WALLET_ADDRESS, `spam-${i}`, (100 + i).toString());
    }

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters?.length).to.equal(1);
    expect(broadcasters?.[0].railgunAddress).to.equal(
      MOCK_RAILGUN_WALLET_ADDRESS,
    );
    // Keeps the cheapest of the spammed offers.
    expect(broadcasters?.[0].tokenFee.feePerUnitGas).to.equal('100');
  });

  it('Should collapse addresses that differ only by viewing key', () => {
    const addresses = [1, 2, 3, 4, 5].map(sameMasterPublicKeyAddress);

    // All distinct address strings...
    expect(new Set(addresses).size).to.equal(5);
    // ...but all the same payee.
    addresses.forEach((address, index) =>
      addFee(address, 'default', (200 + index).toString()),
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters?.length).to.equal(1);
    expect(broadcasters?.[0].tokenFee.feePerUnitGas).to.equal('200');
  });

  it('Should collapse addresses that differ only by embedded chain', () => {
    const addresses = [
      sameMasterPublicKeyAddressForChain(undefined),
      sameMasterPublicKeyAddressForChain(MOCK_CHAIN_ETHEREUM),
      sameMasterPublicKeyAddressForChain(MOCK_CHAIN_POLYGON),
    ];

    expect(new Set(addresses).size).to.equal(3);
    addresses.forEach((address, index) =>
      addFee(address, 'default', (300 + index).toString()),
    );

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters?.length).to.equal(1);
    expect(broadcasters?.[0].tokenFee.feePerUnitGas).to.equal('300');
  });

  it('Should keep distinct payees separate', () => {
    addFee(otherMasterPublicKeyAddress(1n), 'default', '100');
    addFee(otherMasterPublicKeyAddress(2n), 'default', '110');
    addFee(otherMasterPublicKeyAddress(3n), 'default', '120');

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
    );

    expect(broadcasters?.length).to.equal(3);
  });

  it('Should not let a spammer outbid an honest cheaper broadcaster', () => {
    const honest = otherMasterPublicKeyAddress(999n);
    addFee(honest, 'default', '50');
    for (let i = 0; i < 50; i += 1) {
      addFee(MOCK_RAILGUN_WALLET_ADDRESS, `spam-${i}`, '100');
    }

    const best = BroadcasterSearch.findBestBroadcaster(
      chain,
      tokenAddress,
      false,
    );

    expect(best?.railgunAddress).to.equal(honest);
  });

  it('Should not let a spammer skew random broadcaster selection', () => {
    const honest = otherMasterPublicKeyAddress(999n);
    addFee(honest, 'default', '100');
    for (let i = 0; i < 50; i += 1) {
      addFee(MOCK_RAILGUN_WALLET_ADDRESS, `spam-${i}`, '100');
    }

    // Two eligible payees at an identical fee: the spammer must not hold 50
    // of the 51 lottery tickets.
    const picks = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const random = BroadcasterSearch.findRandomBroadcasterForToken(
        chain,
        tokenAddress,
        false,
        10,
      );
      if (random) {
        picks.add(random.railgunAddress);
      }
    }

    expect(picks.size).to.equal(2);
    expect(picks.has(honest)).to.equal(true);
  });
});
