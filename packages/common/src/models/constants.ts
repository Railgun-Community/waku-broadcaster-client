export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/railgun-relayer';

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket relayers (web friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP relayers (node friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
];