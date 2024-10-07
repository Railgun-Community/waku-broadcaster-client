import { PeerId } from '@libp2p/interface';

export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/railgun-broadcaster';

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket broadcasters (web friendly):
  '/dns4/horsey.horsewithsixlegs.xyz/tcp/8000/wss/p2p/16Uiu2HAmLWDFk5nGXgLx2Mz2deiEMRya1HNcvWELMDodkAC891Sd',
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP broadcasters (node friendly):
  '/dns4/horsey.horsewithsixlegs.xyz/tcp/60000/p2p/16Uiu2HAmLWDFk5nGXgLx2Mz2deiEMRya1HNcvWELMDodkAC891Sd',
];
