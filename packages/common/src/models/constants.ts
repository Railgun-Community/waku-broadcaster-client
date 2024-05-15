export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/railgun-broadcaster';

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket broadcasters (web friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
  '/dns4/fleet.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP broadcasters (node friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
  '/dns4/fleet.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
];
