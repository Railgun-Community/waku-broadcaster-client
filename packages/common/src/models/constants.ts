export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/rs/0/1';

export const WAKU_RAILGUN_DEFAULT_SHARD = {
  clusterId: 0,
  shard: 1,
};

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket broadcasters (web friendly):
  '/dns4/core.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAm4Ai1GzKv4EykU26ST1BPT4AHtABsYCLKrDG74GWX7D6H',
  '/dns4/fleet.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAm3GnUDQhBfax298CMkZX9MBHTJ9B8GXhrbueozESUaRZP',
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP broadcasters (node friendly):
  '/dns4/core.rootedinprivacy.com/tcp/60000/p2p/16Uiu2HAm4Ai1GzKv4EykU26ST1BPT4AHtABsYCLKrDG74GWX7D6H',
  '/dns4/fleet.rootedinprivacy.com/tcp/60000/p2p/16Uiu2HAm3GnUDQhBfax298CMkZX9MBHTJ9B8GXhrbueozESUaRZP',
];
