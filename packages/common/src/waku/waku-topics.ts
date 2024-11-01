import { Chain } from '@railgun-community/shared-models';

export const contentTopics = {
  fees: (chain: Chain) => `/railgun/v2/${chain.type}/${chain.id}/fees/json`,
  encrypted: (topic: string) => `/railgun/v2/encrypted${topic}`,
  transact: (chain: Chain) =>
    `/railgun/v2/${chain.type}/${chain.id}/transact/json`,
  transactResponse: (chain: Chain) =>
    `/railgun/v2/${chain.type}/${chain.id}/transact-response/json`,
};
