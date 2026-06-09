import chai from 'chai';
import { BroadcasterConfig } from '../../models/broadcaster-config.js';
import { BroadcasterOptions } from '../../models/export-models.js';
import {
  WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
  WAKU_RAILGUN_DEFAULT_SHARD,
} from '../../models/constants.js';
import { WakuBroadcasterWakuCore } from '../waku-broadcaster-waku-core.js';

const { expect } = chai;

describe('waku-network-config', () => {
  const defaultOptions: BroadcasterOptions = {
    trustedFeeSigner: '',
  };

  beforeEach(() => {
    BroadcasterConfig.configureWakuNetwork({
      clusterId: WAKU_RAILGUN_DEFAULT_SHARD.clusterId,
      shardId: WAKU_RAILGUN_DEFAULT_SHARD.shardId,
    });
    BroadcasterConfig.configurePeerConnections({});
  });

  it('defaults dns discovery to the shared enr tree url', () => {
    expect(BroadcasterConfig.useDNSDiscovery).to.equal(true);
    expect(BroadcasterConfig.customDNS).to.deep.equal({
      onlyCustom: true,
      enrTreePeers: [WAKU_RAILGUN_DEFAULT_ENR_TREE_URL],
    });
  });

  it('uses cluster and shard options for routing and network config', () => {
    WakuBroadcasterWakuCore.setBroadcasterOptions({
      ...defaultOptions,
      clusterId: 12,
      shardId: 7,
    });

    expect(BroadcasterConfig.getWakuRoutingInfo()).to.deep.equal({
      clusterId: 12,
      shard: 7,
      shardId: 7,
      pubsubTopic: '/waku/2/rs/12/7',
    });
    expect(BroadcasterConfig.getWakuNetworkConfig()).to.deep.equal({
      clusterId: 12,
      shards: [7],
    });
  });

  it('parses pubsub topic into routing and network config when cluster and shard are omitted', () => {
    WakuBroadcasterWakuCore.setBroadcasterOptions({
      ...defaultOptions,
      pubSubTopic: '/waku/2/rs/9/4',
    });

    expect(BroadcasterConfig.getWakuRoutingInfo()).to.deep.equal({
      clusterId: 9,
      shard: 4,
      shardId: 4,
      pubsubTopic: '/waku/2/rs/9/4',
    });
    expect(BroadcasterConfig.getWakuNetworkConfig()).to.deep.equal({
      clusterId: 9,
      shards: [4],
    });
  });

  it('maps dns discovery urls, additional peers, and store peers into connection config', () => {
    BroadcasterConfig.configurePeerConnections({
      dnsDiscoveryUrls: [
        ` ${WAKU_RAILGUN_DEFAULT_ENR_TREE_URL} `,
      ],
      additionalPeers: [
        '/dns4/relay-a.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x',
      ],
      storePeers: [
        '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
      ],
    });

    expect(BroadcasterConfig.useDNSDiscovery).to.equal(true);
    expect(BroadcasterConfig.customDNS).to.deep.equal({
      onlyCustom: true,
      enrTreePeers: [
        WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
      ],
    });
    expect(BroadcasterConfig.storePeers).to.deep.equal([
      '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
    ]);
    expect(BroadcasterConfig.additionalDirectPeers).to.deep.equal([
      '/dns4/relay-a.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x',
      '/dns4/client-edge.rootedinprivacy.com/tcp/30304/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
    ]);
    expect(BroadcasterConfig.shouldUseDefaultBootstrap()).to.equal(false);
  });

  it('keeps dns discovery enabled even when false is requested', () => {
    BroadcasterConfig.configurePeerConnections({
      useDNSDiscovery: false,
    });

    expect(BroadcasterConfig.useDNSDiscovery).to.equal(true);
    expect(BroadcasterConfig.customDNS).to.deep.equal({
      onlyCustom: true,
      enrTreePeers: [WAKU_RAILGUN_DEFAULT_ENR_TREE_URL],
    });
  });
});
