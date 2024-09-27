import { Chain } from '@railgun-community/shared-models';

export const contentTopics = {
  default: () => '/railgun/v2/default/json',
  fees: (chain: Chain) => `/railgun/v2/${chain.type}-${chain.id}-fees/json`,
  encrypted: (topic: string) => `/railgun/v2/encrypted${topic}/json`,
  transact: (chain: Chain) =>
    `/railgun/v2/${chain.type}-${chain.id}-transact/json`,
  transactResponse: (chain: Chain) =>
    `/railgun/v2/${chain.type}-${chain.id}-transact-response/json`,
};

export const getAllTopicsExceptEncrypted = (chain: Chain) => {
  return [
    contentTopics.fees(chain),
    contentTopics.transact(chain),
    contentTopics.transactResponse(chain),
  ];
};
