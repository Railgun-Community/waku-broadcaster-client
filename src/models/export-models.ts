export enum RelayerConnectionStatus {
  Error = 'Error',
  Searching = 'Searching',
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  AllUnavailable = 'AllUnavailable',
}

export type RelayerConnectionStatusCallback = (
  status: RelayerConnectionStatus,
) => void;
