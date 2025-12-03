import {
  Chain,
  BroadcasterConnectionStatus,
} from '@railgun-community/shared-models';
import type { CustomDNSConfig } from './broadcaster-config.js';

export type BroadcasterOptions = {
  trustedFeeSigner: string;
  poiActiveListKeys?: string[];
  pubSubTopic?: string;
  additionalDirectPeers?: string[];
  peerDiscoveryTimeout?: number;
  feeExpirationTimeout?: number;
  useDNSDiscovery?: boolean;
  useCustomDNS?: CustomDNSConfig,
  broadcasterVersionRange?: {
    minVersion: string;
    maxVersion: string;
  };
};

export type BroadcasterConnectionStatusCallback = (
  chain: Chain,
  status: BroadcasterConnectionStatus,
) => void;

export type BroadcasterDebugger = {
  log: (msg: string) => void;
  error: (error: Error) => void;
};
