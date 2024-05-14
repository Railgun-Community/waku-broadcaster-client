import {
  Chain,
  BroadcasterConnectionStatus,
} from '@railgun-community/shared-models';

export type BroadcasterOptions = {
  poiActiveListKeys?: string[];
  pubSubTopic?: string;
  additionalDirectPeers?: string[];
  peerDiscoveryTimeout?: number;
};

export type BroadcasterConnectionStatusCallback = (
  chain: Chain,
  status: BroadcasterConnectionStatus,
) => void;

export type BroadcasterDebugger = {
  log: (msg: string) => void;
  error: (error: Error) => void;
};
