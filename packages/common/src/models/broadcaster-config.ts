export type CustomDNSConfig = {
  onlyCustom: boolean,
  enrTreePeers: string[]
}
export class BroadcasterConfig {
  static IS_DEV = false;

  static trustedFeeSigner: string;

  static feeExpirationTimeout = 120_000; // 2 minutes

  static authorizedFeeVariancePercentageLower = 0.10; // 10% lower variance
  static authorizedFeeVariancePercentageUpper = 0.30; // 30% upper variance

  static MINIMUM_BROADCASTER_VERSION = '8.0.0';
  static MAXIMUM_BROADCASTER_VERSION = '8.999.0';

  static useDNSDiscovery = false
  static customDNS: CustomDNSConfig | undefined = undefined
}
