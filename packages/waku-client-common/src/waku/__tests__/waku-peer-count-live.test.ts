import {
  BroadcasterConnectionStatus,
  Chain,
  delay,
  poll,
} from '@railgun-community/shared-models';
import chai from 'chai';
import { WakuBroadcasterClient } from '../../waku-broadcaster-client.js';
import { BroadcasterOptions } from '../../models/index.js';
import { WAKU_RAILGUN_DEFAULT_ENR_TREE_URL } from '../../models/constants.js';
import { WakuBroadcasterWakuCore } from '../waku-broadcaster-waku-core.js';

const { expect } = chai;

const RUN_WAKU_PEERCOUNT = process.env.RUN_WAKU_PEERCOUNT === '1';
const isWebPackage = process.cwd().includes('/packages/web');

const TEST_CHAIN: Chain = {
  type: 0,
  id: 1,
} as Chain;

const TEST_DNS_DISCOVERY_URL = WAKU_RAILGUN_DEFAULT_ENR_TREE_URL;
const TEST_PUBSUB_TOPIC = '/waku/2/rs/5/1';
const TEST_WEB_INGRESS_PEERS = [
  '/dns4/client-edge.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A',
  '/dns4/relay-a.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x',
  '/dns4/relay-b.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmPtEAoPPok7VLrpNNC6t92ZQFqLndHvkdx6Fk3CxA4MaG',
];

const broadcasterOptions: BroadcasterOptions = {
  trustedFeeSigner: '',
  dnsDiscoveryUrls: [TEST_DNS_DISCOVERY_URL],
  additionalDirectPeers: isWebPackage ? TEST_WEB_INGRESS_PEERS : [],
  storePeers: isWebPackage ? TEST_WEB_INGRESS_PEERS : [],
  pubSubTopic: TEST_PUBSUB_TOPIC,
  peerDiscoveryTimeout: 120_000,
};

describe('waku-peer-count-live', function () {
  this.timeout(180_000);

  afterEach(async () => {
    await WakuBroadcasterClient.stop();
    WakuBroadcasterWakuCore.waku = undefined;
    WakuBroadcasterWakuCore.hasError = false;
  });

  it('tracks max real peer count over 90 seconds on Ethereum', async function () {
    if (!RUN_WAKU_PEERCOUNT) {
      this.skip();
      return;
    }

    let currentStatus: BroadcasterConnectionStatus =
      BroadcasterConnectionStatus.Disconnected;

    await WakuBroadcasterClient.start(
      TEST_CHAIN,
      broadcasterOptions,
      (_chain, status) => {
        currentStatus = status;
      },
      {
        log: console.log,
        error: console.error,
      },
    );

    const statusConnected = await poll(
      async () => currentStatus,
      status => status === BroadcasterConnectionStatus.Connected,
      100,
      1200,
    );
    expect(statusConnected).to.equal(BroadcasterConnectionStatus.Connected);

    const startedAt = Date.now();
    const durationMs = 90_000;
    const sampleIntervalMs = 5_000;
    let maxConnections = 0;
    let maxPeers: string[] = [];

    while (Date.now() - startedAt < durationMs) {
      const snapshot = await WakuBroadcasterWakuCore.getHealthSnapshot();
      const count = snapshot.connections.count;
      if (count > maxConnections) {
        maxConnections = count;
        maxPeers = snapshot.connections.peers;
      }

      console.log(
        `[waku-peer-count-live] ${new Date().toISOString()} package=${isWebPackage ? 'web' : 'node'} connections=${count} peers=${snapshot.connections.peers.join(', ') || 'none'} max=${maxConnections}`,
      );

      await delay(sampleIntervalMs);
    }

    console.log(
      `[waku-peer-count-live] package=${isWebPackage ? 'web' : 'node'} maxConnectionsObserved=${maxConnections} peers=${maxPeers.join(', ') || 'none'}`,
    );
  });
});
