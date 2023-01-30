export enum RelayerConnectionStatus {
  Searching = 'Searching',
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  AllUnavailable = 'AllUnavailable',
}

export type CachedTokenFee = {
  feePerUnitGas: string;
  expiration: number;
  feesID: string;
  availableWallets: number;
  relayAdapt: string;
};

export type SelectedRelayer = {
  railgunAddress: string;
  tokenAddress: string;
  tokenFee: CachedTokenFee;
};
