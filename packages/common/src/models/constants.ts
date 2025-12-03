export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/rs/1/1';

export const WAKU_RAILGUN_DEFAULT_SHARD = {
  clusterId: 1,
  shard: 1,
  shardId: 1,
  pubsubTopic: WAKU_RAILGUN_PUB_SUB_TOPIC,
};

export const WAKU_RAILGUN_DEFAULT_SHARDS = {
  clusterId: 1,
  shards: [0, 1, 2, 3, 4, 5],
};

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket broadcasters (web friendly):
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP broadcasters (node friendly):
];
