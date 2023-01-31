import { Chain, ChainType } from '@railgun-community/shared-models';

export const MOCK_CHAIN: Chain = {
  type: ChainType.EVM,
  id: 1,
};

export const MOCK_CHAIN_GOERLI: Chain = {
  type: ChainType.EVM,
  id: 5,
};

export const MOCK_DB_ENCRYPTION_KEY =
  '0101010101010101010101010101010101010101010101010101010101010101';

export const MOCK_MNEMONIC =
  'test test test test test test test test test test test junk';

export const MOCK_MNEMONIC_2 =
  'pause crystal tornado alcohol genre cement fade large song like bag where';
