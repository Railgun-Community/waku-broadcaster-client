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

export type RelayerDebugger = {
  log: (msg: string) => void;
  error: (error: Error) => void;
};
