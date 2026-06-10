import {
  Chain,
  BroadcasterConnectionStatus,
} from '@railgun-community/shared-models';
import type { CustomDNSConfig } from './broadcaster-config.js';

export type BroadcasterOptions = {
  trustedFeeSigner: string | string[];
  poiActiveListKeys?: string[];
  enableHealthcheckLogs?: boolean;
  pubSubTopic?: string;
  clusterId?: number;
  shardId?: number;
  dnsDiscoveryUrls?: string[];
  additionalPeers?: string[];
  storePeers?: string[];
  additionalDirectPeers?: string[];
  peerDiscoveryTimeout?: number;
  feeExpirationTimeout?: number;
  historicalLookBackTime?: number;
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
