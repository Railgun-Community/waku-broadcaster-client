import chai from 'chai';
import { BroadcasterFeeCache } from '../../fees/broadcaster-fee-cache.js';
import { BroadcasterConfig } from '../../models/broadcaster-config.js';
import { AddressFilter } from '../../filters/address-filter.js';
import { BroadcasterSearch } from '../best-broadcaster.js';
import {
  resetSessionSeedForTests,
  setSessionSeedForTests,
} from '../../utils/session-seed.js';
import { MOCK_CHAIN_ETHEREUM } from '../../tests/mocks.test.js';

const { expect } = chai;

const chain = MOCK_CHAIN_ETHEREUM;
const tokenAddress = '0x1234567890123456789012345678901234567890';
const trustedSigner = '0xTrustedSigner';
const broadcaster1 = '0xBroadcaster1';
const broadcaster2 = '0xBroadcaster2';
const broadcaster3 = '0xBroadcaster3';
const broadcaster4 = '0xBroadcaster4';
const broadcaster6 = '0xBroadcaster6';

const addBroadcasterFees = (
  railgunAddress: string,
  feePerUnitGas: string,
  reliability: number,
  identifiers: string[] = ['id1'],
) => {
  identifiers.forEach((identifier: string) => {
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
  });
};

describe('best-broadcaster', () => {
  before(() => {
    BroadcasterConfig.trustedFeeSigner = trustedSigner;
  });

  beforeEach(() => {
    BroadcasterFeeCache.init(['test_list']);
    (BroadcasterFeeCache as any).cache = { forNetwork: {} };
    (BroadcasterFeeCache as any).authorizedFees = {};
    (BroadcasterFeeCache as any).averageAuthorizedFees = {};
    AddressFilter.setAllowlist(undefined);
    AddressFilter.setBlocklist(undefined);
    // Pin a known session seed so ordering assertions are deterministic.
    setSessionSeedForTests('0xTESTSEED');
  });

  afterEach(() => {
    resetSessionSeedForTests();
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

  it('Should order exact-tier broadcasters by seeded session rank (non-lexicographic)', () => {
    // All broadcasters tie on fee and reliability. Under the pinned session
    // seed the session rank order is [broadcaster1, broadcaster4,
    // broadcaster3, broadcaster2], which is neither lexicographic nor
    // insertion order.
    addBroadcasterFees(broadcaster1, '100', 1);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '100', 1);
    addBroadcasterFees(broadcaster4, '100', 1);

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true, // ignoreMissingAuthorizedFee
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(4);
    const addresses = broadcasters?.map(b => b.railgunAddress);
    expect(addresses).to.deep.equal([
      broadcaster1,
      broadcaster4,
      broadcaster3,
      broadcaster2,
    ]);
    expect(addresses).to.not.deep.equal(
      [broadcaster1, broadcaster2, broadcaster3, broadcaster4].sort(),
    );
  });

  it('Should keep broadcaster order stable across repeated calls and cache regeneration', () => {
    // broadcaster1 contributes two identifiers; all candidates tie on fee and
    // reliability. Expected round-robin order under the pinned seed is
    // [broadcaster1, broadcaster3, broadcaster2, broadcaster1].
    addBroadcasterFees(broadcaster1, '100', 1, ['id1', 'id2']);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '100', 1);

    const broadcastersFirst = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );
    const addressesFirst = broadcastersFirst?.map(b => b.railgunAddress);
    expect(addressesFirst).to.deep.equal([
      broadcaster1,
      broadcaster3,
      broadcaster2,
      broadcaster1,
    ]);

    // Simulate cache refresh/reconnect: wipe the cache and re-add the same
    // effective entries. The session seed must not be reset, so the exact
    // order is unchanged.
    (BroadcasterFeeCache as any).cache = { forNetwork: {} };
    addBroadcasterFees(broadcaster1, '100', 1, ['id1', 'id2']);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '100', 1);

    const broadcastersSecond = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );
    expect(broadcastersSecond?.map(b => b.railgunAddress)).to.deep.equal(
      addressesFirst,
    );
  });

  it('Should enforce fee ascending then reliability descending precedence', () => {
    // Broadcaster 4: lowest fee but lowest reliability (0.1).
    // Broadcasters 2/3: same fee, differing reliability (1 vs 0.5).
    // Broadcaster 1: highest fee.
    // Expected strict order: [broadcaster4, broadcaster2, broadcaster3,
    // broadcaster1] - fee is primary, reliability only breaks fee ties.
    addBroadcasterFees(broadcaster1, '100', 1);
    addBroadcasterFees(broadcaster2, '90', 1);
    addBroadcasterFees(broadcaster3, '90', 0.5);
    addBroadcasterFees(broadcaster4, '80', 0.1);

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );

    expect(broadcasters?.map(b => b.railgunAddress)).to.deep.equal([
      broadcaster4,
      broadcaster2,
      broadcaster3,
      broadcaster1,
    ]);
  });

  it('Should enforce strict tier boundaries with within-tier round-robin across tiers', () => {
    // Tier 1: fee 90, reliability 1 - broadcaster2 (two identifiers) and
    // broadcaster1 (one identifier). Under seed '0xTESTSEED2' the session rank
    // order is [broadcaster2, broadcaster1], so round-robin emits
    // [broadcaster2, broadcaster1, broadcaster2].
    // Tier 2: fee 100, reliability 1 - broadcaster4 and broadcaster6. Rank
    // order is [broadcaster4, broadcaster6], so emits [broadcaster4,
    // broadcaster6].
    // Strict boundary: all fee-90 candidates precede all fee-100 candidates.
    setSessionSeedForTests('0xTESTSEED2');
    addBroadcasterFees(broadcaster1, '90', 1);
    addBroadcasterFees(broadcaster2, '90', 1, ['id1', 'id2']);
    addBroadcasterFees(broadcaster4, '100', 1);
    addBroadcasterFees(broadcaster6, '100', 1);

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(5);
    expect(broadcasters?.map(b => b.railgunAddress)).to.deep.equal([
      broadcaster2,
      broadcaster1,
      broadcaster2,
      broadcaster4,
      broadcaster6,
    ]);

    // Verify the tier boundary strictly holds by fee.
    const fees = broadcasters?.map(b => BigInt(b.tokenFee.feePerUnitGas));
    expect(fees?.[2]).to.equal(90n);
    expect(fees?.[3]).to.equal(100n);
  });

  it('Should group numerically equal fee representations into one tier', () => {
    // broadcaster3 advertises '0100' while broadcaster1 and broadcaster2
    // advertise '100'. All three are numerically equal and reliability ties at
    // 1, so they must share one tier. Under seed '0xTESTSEED' the session rank
    // order is [broadcaster1, broadcaster3, broadcaster2]. If string
    // inequality split the tier, '0100' would emit in a separate trailing tier
    // and the order would be [broadcaster2, broadcaster1, broadcaster3].
    addBroadcasterFees(broadcaster1, '100', 1);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '0100', 1);

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(3);
    expect(broadcasters?.map(b => b.railgunAddress)).to.deep.equal([
      broadcaster1,
      broadcaster3,
      broadcaster2,
    ]);
  });

  it('Should round-robin interleave multiple identifiers from one address with tied addresses', () => {
    // All candidates tie on fee and reliability. Under seed '0xTESTSEED2' the
    // session rank order is [broadcaster2, broadcaster1, broadcaster3].
    // broadcaster1 has three identifiers, so the round-robin emission is
    // [broadcaster2, broadcaster1, broadcaster3, broadcaster1, broadcaster1]
    // (one per address in rank order before a second candidate for any
    // address), with no deduplication.
    setSessionSeedForTests('0xTESTSEED2');
    addBroadcasterFees(broadcaster1, '100', 1, ['id1', 'id2', 'id3']);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '100', 1);

    const broadcasters = BroadcasterSearch.findBroadcastersForToken(
      chain,
      tokenAddress,
      false,
      true,
    );

    expect(broadcasters).to.be.an('array');
    expect(broadcasters?.length).to.equal(5);
    expect(broadcasters?.map(b => b.railgunAddress)).to.deep.equal([
      broadcaster2,
      broadcaster1,
      broadcaster3,
      broadcaster1,
      broadcaster1,
    ]);
  });

  it('Should return full-tie order for findBestBroadcaster with identical fee and reliability', () => {
    // All broadcasters tie on fee and reliability. findBestBroadcaster returns
    // the first entry of the already-ordered findBroadcastersForToken result,
    // so it returns the first address in session rank order
    // ([broadcaster1, ...]).
    BroadcasterFeeCache.addAuthorizedFees(trustedSigner, {
      [tokenAddress]: {
        feePerUnitGas: '100',
        expiration: Date.now() + 100000,
        feesID: '1',
        availableWallets: 1,
        relayAdapt: '0x',
        reliability: 1,
      },
    });
    addBroadcasterFees(broadcaster1, '100', 1);
    addBroadcasterFees(broadcaster2, '100', 1);
    addBroadcasterFees(broadcaster3, '100', 1);

    const bestBroadcaster = BroadcasterSearch.findBestBroadcaster(
      chain,
      tokenAddress,
      false,
    );

    expect(bestBroadcaster?.railgunAddress).to.equal(broadcaster1);
  });
});
