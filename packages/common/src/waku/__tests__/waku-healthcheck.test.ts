import chai from 'chai';
import { BroadcasterConfig } from '../../models/broadcaster-config.js';
import {
  WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
  WAKU_RAILGUN_DEFAULT_SHARD,
} from '../../models/constants.js';
import { WakuBroadcasterWakuCore } from '../waku-broadcaster-waku-core.js';

const { expect } = chai;

describe('waku-healthcheck', () => {
  beforeEach(() => {
    BroadcasterConfig.configureWakuNetwork({
      clusterId: WAKU_RAILGUN_DEFAULT_SHARD.clusterId,
      shardId: WAKU_RAILGUN_DEFAULT_SHARD.shardId,
    });
    BroadcasterConfig.configurePeerConnections({
      dnsDiscoveryUrls: [
        WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
      ],
      additionalPeers: [
        '/dns4/relay-a.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x',
      ],
      storePeers: [
        '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
      ],
    });
    WakuBroadcasterWakuCore.hasError = false;
    WakuBroadcasterWakuCore.restartCount = 2;
    WakuBroadcasterWakuCore.waku = {
      isStarted: () => true,
      libp2p: {
        getConnections: () => [
          {
            remotePeer: {
              toString: () => '16Uiu2HAmMockPeer',
            },
          },
        ],
      },
    } as any;
  });

  afterEach(() => {
    WakuBroadcasterWakuCore.waku = undefined;
  });

  it('returns peer and routing details for healthchecks', async () => {
    WakuBroadcasterWakuCore.waku = {
      isStarted: () => true,
      libp2p: {
        getConnections: () => [
          {
            remotePeer: {
              toString: () => '16Uiu2HAmMockPeer',
            },
          },
        ],
        peerStore: {
          all: async () => [
            {
              id: {
                toString: () => '16Uiu2HAmMockPeer',
              },
              protocols: ['/vac/waku/peer-exchange/2.0.0-alpha1'],
              tags: new Map([
                ['bootstrap', { value: 50 }],
                ['peer-exchange', { value: 50 }],
              ]),
            },
          ],
        },
      },
    } as any;

    const snapshot = await WakuBroadcasterWakuCore.getHealthSnapshot();

    expect(snapshot.hasWaku).to.equal(true);
    expect(snapshot.isStarted).to.equal(true);
    expect(snapshot.restartCount).to.equal(2);
    expect(snapshot.routing).to.deep.equal({
      clusterId: 5,
      shard: 5,
      shardId: 5,
      pubsubTopic: '/waku/2/rs/5/5',
    });
    expect(snapshot.configuredPeers).to.deep.equal({
      useDNSDiscovery: true,
      dnsDiscoveryUrls: [
        WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
      ],
      bootstrapPeers: [
        '/dns4/relay-a.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x',
        '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
      ],
      storePeers: [
        '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
      ],
    });
    expect(snapshot.connections).to.deep.equal({
      count: 1,
      peers: ['16Uiu2HAmMockPeer'],
    });
    expect(snapshot.discovery).to.deep.equal({
      connectedPeerDetails: [
        {
          peerId: '16Uiu2HAmMockPeer',
          supportsPeerExchange: true,
          protocols: ['/vac/waku/peer-exchange/2.0.0-alpha1'],
          tags: ['bootstrap', 'peer-exchange'],
        },
      ],
      peerStore: {
        count: 1,
        bootstrapCount: 1,
        peerExchangeCount: 1,
        bootstrapPeers: ['16Uiu2HAmMockPeer'],
        peerExchangePeers: ['16Uiu2HAmMockPeer'],
        connectedPeersSupportingPeerExchange: ['16Uiu2HAmMockPeer'],
      },
    });
  });
});
