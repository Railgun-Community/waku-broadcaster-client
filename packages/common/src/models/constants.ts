export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/railgun-relayer';

export const WAKU_RAILGUN_DEFAULT_PEERS: string[] = [
  // Some Websocket relayers (web friendly):
  '/dns4/relayerv4.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAmCMBVq9am26T61B7FyZ6JbEDusH4c7M7AYVMwNnRuP2cg',
  '/dns4/fleet.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
  '/dns4/fleet.wecamefromapes.com/tcp/8001/wss/p2p/16Uiu2HAmTCCZFbQxDNF1TL9TKSPXtfF9QJtNWhCFE5M8UNzk7DQv',
  // Some TCP relayers (node friendly):
  '/dns4/fleet.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
  '/dns4/fleet.wecamefromapes.com/tcp/60001/p2p/16Uiu2HAmTCCZFbQxDNF1TL9TKSPXtfF9QJtNWhCFE5M8UNzk7DQv',
  '/dns4/fleet.wecamefromapes.com/tcp/60002/p2p/16Uiu2HAm2g9z6PyWCAe6RXXQto6ykD4EM6YH67mmQYfBQtb6ZxFi',
];