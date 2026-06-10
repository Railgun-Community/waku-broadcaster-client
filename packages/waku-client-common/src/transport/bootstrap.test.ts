import { describe, expect, test } from 'vitest';
import { resolveBootstrap, ZENO_DEV_NETWORK, ZENO_PROD_NETWORK } from './bootstrap.js';

const zenoNodeA = '/dns4/waku-a.zeno.example/tcp/8000/wss/p2p/16Uiu2HAmA';
const zenoNodeB = '/dns4/waku-b.zeno.example/tcp/8000/wss/p2p/16Uiu2HAmB';
const enrPeer = '/dns4/twn-node.example/tcp/8000/wss/p2p/16Uiu2HAmC';

describe('network presets (the approved ladder)', () => {
  test('dev/launch preset piggybacks on TWN (cluster 1)', () => {
    expect(ZENO_DEV_NETWORK.clusterId).toBe(1);
  });

  test('production target is the Zeno-own shard 6/0', () => {
    expect(ZENO_PROD_NETWORK.clusterId).toBe(6);
    expect(ZENO_PROD_NETWORK.shardId).toBe(0);
  });

  test('peer-exchange admission stays bounded (Railgun parity)', () => {
    expect(ZENO_DEV_NETWORK.peerExchange).toEqual({ maxBootstrapPeers: 2, maxConnections: 5 });
  });
});

describe('resolveBootstrap', () => {
  test('static peers come first (Zeno member nodes are the preferred path)', async () => {
    const peers = await resolveBootstrap(
      {
        ...ZENO_DEV_NETWORK,
        staticPeers: [zenoNodeA, zenoNodeB],
        enrTree: 'enrtree://EXAMPLE@twn',
      },
      { resolveEnrTree: () => Promise.resolve([enrPeer]) },
    );
    expect(peers.slice(0, 2)).toEqual([zenoNodeA, zenoNodeB]);
    expect(peers).toContain(enrPeer);
  });

  test('resolves the configured ENR tree through the injected resolver', async () => {
    const seen: string[] = [];
    await resolveBootstrap(
      { ...ZENO_DEV_NETWORK, staticPeers: [], enrTree: 'enrtree://EXAMPLE@twn' },
      {
        resolveEnrTree: (tree) => {
          seen.push(tree);
          return Promise.resolve([enrPeer]);
        },
      },
    );
    expect(seen).toEqual(['enrtree://EXAMPLE@twn']);
  });

  test('works with static peers only (test fixtures and docker-compose nwaku)', async () => {
    const peers = await resolveBootstrap(
      { ...ZENO_DEV_NETWORK, staticPeers: [zenoNodeA] },
      { resolveEnrTree: () => Promise.reject(new Error('must not be called')) },
    );
    expect(peers).toEqual([zenoNodeA]);
  });

  test('fails with a structured error when no peer source is configured', async () => {
    const outcome = await resolveBootstrap(
      { ...ZENO_DEV_NETWORK, staticPeers: [] },
      { resolveEnrTree: () => Promise.resolve([]) },
    ).catch((e: unknown) => e);
    expect((outcome as { kind: string }).kind).toBe('node-init-failed');
  });
});
