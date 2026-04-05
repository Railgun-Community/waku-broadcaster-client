import LevelDOWN from 'leveldown';
import fs from 'fs';
import { ArtifactStore, startRailgunEngine } from '@railgun-community/wallet';
import { BroadcasterConfig } from '../models/broadcaster-config.js';
import {
  WAKU_RAILGUN_DEFAULT_ENR_TREE_URL,
  WAKU_RAILGUN_DEFAULT_PEERS_NODE,
  WAKU_RAILGUN_DEFAULT_PEERS_WEB,
} from '../models/constants.js';

const TEST_DNS_DISCOVERY_URL = WAKU_RAILGUN_DEFAULT_ENR_TREE_URL;
const TEST_PUBSUB_TOPIC = '/waku/2/rs/5/1';
const TEST_DEFAULT_PEERS = process.cwd().includes('/packages/web')
  ? WAKU_RAILGUN_DEFAULT_PEERS_WEB
  : WAKU_RAILGUN_DEFAULT_PEERS_NODE;

const fileExists = (path: string): Promise<boolean> => {
  return new Promise(resolve => {
    fs.promises
      .access(path)
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
};

const testArtifactStore = new ArtifactStore(
  fs.promises.readFile,
  async (dir, path, data) => {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path, data);
  },
  fileExists,
);

export const initTestEngine = async (useNativeArtifacts = false) => {
  const TEST_DB = 'test.db';
  if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB, { recursive: true });

  BroadcasterConfig.configureWakuNetwork({
    pubSubTopic: TEST_PUBSUB_TOPIC,
  });
  BroadcasterConfig.configurePeerConnections({
    dnsDiscoveryUrls: [TEST_DNS_DISCOVERY_URL],
    additionalDirectPeers: TEST_DEFAULT_PEERS,
    storePeers: TEST_DEFAULT_PEERS,
  });

  await startRailgunEngine(
    'TESTS',
    // @ts-ignore
    new LevelDOWN(TEST_DB),
    true, // shouldDebug
    testArtifactStore,
    useNativeArtifacts,
    false, // skipMerkletreeScans
    ['mock-poi-url'], // poiNodeURLs
  );
};
