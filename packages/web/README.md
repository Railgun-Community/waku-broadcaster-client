# RAILGUN Broadcaster Client (Web)

The **Browser/Web** specific package for the RAILGUN Broadcaster Client. This package is designed to run in client-side applications (dApps, wallets) that run in a web browser.

## Installation

```bash
yarn add @railgun-community/waku-broadcaster-client-web
# or
npm install @railgun-community/waku-broadcaster-client-web
```

## Usage

### 1. Initialization

Initialize the client to connect to the Waku network. In a browser environment, this typically uses WebSocket connections.

```typescript
import { WakuBroadcasterClient } from '@railgun-community/waku-broadcaster-client-web';
import { Chain } from '@railgun-community/shared-models';

const chain: Chain = { type: 0, id: 1 }; // Ethereum Mainnet

const broadcasterOptions = {
  // Required: Trusted Fee Signer
  trustedFeeSigner: '0zk1...', 
  // Optional: Waku options
  pubSubTopic: '/waku/2/default-waku/proto', 
  feeExpirationTimeout: 30000, // 30 seconds
  peerDiscoveryTimeout: 10000, // 10 seconds
  additionalDirectPeers: [], // Optional: Direct peers to connect to
  poiActiveListKeys: [], // Optional: POI keys
  useDNSDiscovery: false, // Optional: Use DNS discovery
  useCustomDNS: { // Optional: Custom DNS config
    onlyCustom: false,
    enrTreePeers: []
  },
  broadcasterVersionRange: { // Optional: Broadcaster version range
    minVersion: '8.0.0',
    maxVersion: '8.999.0'
  }
};

const statusCallback = (status: BroadcasterConnectionStatus) => {
  console.log('Connection status:', status);
};

await WakuBroadcasterClient.start(chain, broadcasterOptions, statusCallback);
console.log('Waku Broadcaster Client started');
```

### 2. Finding a Broadcaster

Once started, the client listens for fee updates from Broadcasters. You can query for the best broadcaster for a specific token.

```typescript
import { Chain } from '@railgun-community/shared-models';

const chain: Chain = { type: 0, id: 1 }; // Ethereum Mainnet
const tokenAddress = '0x6b175474e89094c44da98b954eedeac495271d0f'; // DAI

// Wait a few seconds for peer discovery and fee updates...
// In a UI, you might show a loading spinner or "Searching for broadcasters..." status.

const selectedBroadcaster = await WakuBroadcasterClient.findBestBroadcaster(
  chain,
  tokenAddress
);

if (selectedBroadcaster) {
  console.log('Found broadcaster:', selectedBroadcaster.railgunAddress);
} else {
  console.log('No broadcaster found for this token');
}
```

### 3. Sending a Transaction

Create a transaction and send it through the selected broadcaster.

```typescript
import { BroadcasterTransaction } from '@railgun-community/waku-broadcaster-client-web';
import { TXIDVersion } from '@railgun-community/shared-models';

// ... (Assume you have a railgunWallet and transactionRequest)

const txidVersion = TXIDVersion.V2_PoseidonMerkle; // or V3
const to = '0x...'; // Destination address
const data = '0x...'; // Transaction data
const nullifiers = ['0x...']; // Nullifiers
const overallBatchMinGasPrice = 1000000000n; // Min gas price
const useRelayAdapt = false; // Whether to use Relay Adapt
const preTransactionPOIs = {}; // POIs

const broadcasterTransaction = await BroadcasterTransaction.create(
  txidVersion,
  to,
  data,
  selectedBroadcaster.railgunAddress,
  selectedBroadcaster.feesID,
  chain,
  nullifiers,
  overallBatchMinGasPrice,
  useRelayAdapt,
  preTransactionPOIs
);

try {
  const response = await BroadcasterTransaction.send(broadcasterTransaction);
  console.log('Transaction submitted. Tx Hash:', response.txHash);
} catch (error) {
  console.error('Failed to send transaction:', error);
}
```

## Configuration

The `start` method accepts a `BroadcasterOptions` object.

-   `trustedFeeSigner`: (Required) The public key of the trusted fee signer.
-   `poiActiveListKeys`: (Optional) List of active POI list keys.
-   `pubSubTopic`: (Optional) The Waku pubsub topic to subscribe to. Defaults to the RAILGUN topic.
-   `additionalDirectPeers`: (Optional) Array of multiaddrs for direct peer connections.
-   `peerDiscoveryTimeout`: (Optional) Timeout in milliseconds for peer discovery.
-   `feeExpirationTimeout`: (Optional) Timeout in milliseconds for fee expiration.
-   `useDNSDiscovery`: (Optional) Boolean to enable DNS peer discovery.
-   `useCustomDNS`: (Optional) Configuration for custom DNS discovery.
    -   `onlyCustom`: (Boolean) If true, only use the provided `enrTreePeers`.
    -   `enrTreePeers`: (Array<string>) List of ENR tree URLs.
-   `broadcasterVersionRange`: (Optional) Object specifying the allowed broadcaster version range.
    -   `minVersion`: (String) Minimum allowed version.
    -   `maxVersion`: (String) Maximum allowed version.

## Webpack Configuration

Some dependencies of this package, such as Waku and libp2p, make assumptions that they are running in a Node.js environment. This is not the case in a browser environment, so we need to configure Webpack to ignore some sub-dependencies that are not relevant in the browser.

**webpack.config.js**

```js
module.exports = {
  //...
  resolve: {
    fallback: {
      // Polyfills for Node.js core modules if needed
      "stream": require.resolve("stream-browserify"),
      "crypto": require.resolve("crypto-browserify"),
    }
  },
};
```

### Next.js Configuration

If you are using **Next.js**, you need to handle server-side vs client-side bundling:

```js
/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config, options) => {
    if (options.isServer) {
      // If your Next.js component is running in the server, you need to avoid
      // loading a WASM module.
      config.resolve.alias['@railgun-community/curve25519-scalarmult-wasm'] =
        '@railgun-community/curve25519-scalarmult-rsjs';
    } else {
      // If your Next.js component is running in the browser, you need to avoid
      // loading some modules which call Node.js APIs such as `child_process`.
    }
    return config;
  },
};
```

## Dependencies

This package relies on:
-   `@waku/sdk`: For Waku networking.
-   `@waku/discovery`: For peer discovery.

## License

MIT

