export const WAKU_RAILGUN_PUB_SUB_TOPIC = '/waku/2/railgun-broadcaster';

export const WAKU_RAILGUN_DEFAULT_PEERS_WEB: string[] = [
  // Some Websocket relayers (web friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
  '/dns4/fleet.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
  '/dns4/fleet.wecamefromapes.com/tcp/8001/wss/p2p/16Uiu2HAmTCCZFbQxDNF1TL9TKSPXtfF9QJtNWhCFE5M8UNzk7DQv',
  '/dns4/fleet.wecamefromapes.com/tcp/8002/wss/p2p/16Uiu2HAm2g9z6PyWCAe6RXXQto6ykD4EM6YH67mmQYfBQtb6ZxFi',
  '/dns4/relayerv4.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAmCMBVq9am26T61B7FyZ6JbEDusH4c7M7AYVMwNnRuP2cg',
  '/dns4/chimpfood.wecamefromapes.com/tcp/8000/wss/p2p/16Uiu2HAm26NseNxk97r7qPLzjELYaW857wvDARrxVZtBthV1N8ox',
];

export const WAKU_RAILGUN_DEFAULT_PEERS_NODE: string[] = [
  // Some TCP relayers (node friendly):
  '/dns4/teelf.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkygexqAtchrhYVqLFBTXFEEZPtz8C8ZnSP6iYy1s22mfW',
  '/dns4/fleet.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAkyCqm8368Z1Y1pvrBcQQtb66Mjj7uvyAKGdwur3uCbqfb',
  // '/dns4/fleet.wecamefromapes.com/tcp/60001/p2p/16Uiu2HAmTCCZFbQxDNF1TL9TKSPXtfF9QJtNWhCFE5M8UNzk7DQv',
  // '/dns4/fleet.wecamefromapes.com/tcp/60002/p2p/16Uiu2HAm2g9z6PyWCAe6RXXQto6ykD4EM6YH67mmQYfBQtb6ZxFi',
  // '/dns4/relayerv4.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAmCMBVq9am26T61B7FyZ6JbEDusH4c7M7AYVMwNnRuP2cg',
  // '/dns4/chimpfood.wecamefromapes.com/tcp/60000/p2p/16Uiu2HAm26NseNxk97r7qPLzjELYaW857wvDARrxVZtBthV1N8ox'
];
