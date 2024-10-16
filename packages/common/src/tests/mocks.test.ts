import {
  Chain,
  FallbackProviderJsonConfig,
  NETWORK_CONFIG,
  NetworkName,
} from '@railgun-community/shared-models';

export const MOCK_TOKEN: string =
  NETWORK_CONFIG[NetworkName.Ethereum].baseToken.wrappedAddress;

export const MOCK_CHAIN: Chain = NETWORK_CONFIG[NetworkName.Ethereum].chain;

export const MOCK_CHAIN_SEPOLIA: Chain =
  NETWORK_CONFIG[NetworkName.EthereumSepolia].chain;

export const MOCK_DB_ENCRYPTION_KEY =
  '0101010101010101010101010101010101010101010101010101010101010101';

export const MOCK_MNEMONIC =
  'test test test test test test test test test test test junk';

export const MOCK_MNEMONIC_2 =
  'pause crystal tornado alcohol genre cement fade large song like bag where';

export const MOCK_RAILGUN_WALLET_ADDRESS =
  '0zk1q8hxknrs97q8pjxaagwthzc0df99rzmhl2xnlxmgv9akv32sua0kfrv7j6fe3z53llhxknrs97q8pjxaagwthzc0df99rzmhl2xnlxmgv9akv32sua0kg0zpzts';

export const MOCK_FALLBACK_PROVIDER_JSON_CONFIG_ETHEREUM: FallbackProviderJsonConfig =
  {
    chainId: 1,
    providers: [
      {
        provider: 'https://eth.llamarpc.com',
        priority: 3,
        weight: 3,
      },
      {
        provider: 'https://rpc.ankr.com/eth',
        priority: 3,
        weight: 2,
      },
    ],
  };
