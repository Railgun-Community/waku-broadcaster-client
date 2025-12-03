[![Unit Tests](https://github.com/Railgun-Community/waku-broadcaster-client/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/Railgun-Community/waku-broadcaster-client/actions)

# RAILGUN Broadcaster Client with Waku Networking Layer

The **RAILGUN Broadcaster Client** is a TypeScript library that enables users to interact with RAILGUN Broadcasters via the privacy-preserving [Waku](https://waku.org/) peer-to-peer network.

Broadcasters are service providers in the RAILGUN privacy system that relay transactions on behalf of users, allowing them to pay gas fees in tokens (like DAI, USDC, etc.) instead of the native chain token (ETH, MATIC, etc.), maintaining their privacy.

This repository contains the client-side logic to:
1.  **Connect** to the Waku network.
2.  **Discover** available Broadcasters.
3.  **Receive** fee quotes from Broadcasters.
4.  **Select** the best Broadcaster based on fees and reliability.
5.  **Send** transactions to the selected Broadcaster for execution.

## Packages

This repository is a monorepo containing the following packages:

-   **[`@railgun-community/waku-broadcaster-client-node`](./packages/node/README.md)**: For Node.js environments (servers, scripts, bots).
-   **[`@railgun-community/waku-broadcaster-client-web`](./packages/web/README.md)**: For Browser environments (dApps, web wallets).

## Installation

Choose the package appropriate for your environment:

### Node.js

```bash
yarn add @railgun-community/waku-broadcaster-client-node
# or
npm install @railgun-community/waku-broadcaster-client-node
```

### Browser (Web)

```bash
yarn add @railgun-community/waku-broadcaster-client-web
# or
npm install @railgun-community/waku-broadcaster-client-web
```

## Core Concepts

### Waku Network
The client uses Waku, a family of robust, censorship-resistant, and privacy-preserving communication protocols. It connects to Waku nodes to gossip messages about fee updates and transaction requests without revealing the user's IP address or identity to the Broadcaster directly.

### Broadcaster Discovery
Broadcasters periodically announce their presence and current fee schedules over Waku topics. The client listens to these topics to build a local cache of available Broadcasters.

### Fee Selection
When a user wants to send a transaction, the client queries its local cache to find Broadcasters that accept the desired token and offer the best exchange rate (fee).

## Usage Overview

The API is consistent across both Node.js and Web packages, with minor differences in initialization.

```typescript
import { WakuBroadcasterClient } from '@railgun-community/waku-broadcaster-client-node'; // or -web
import { BroadcasterTransaction } from '@railgun-community/waku-broadcaster-client-node'; // or -web

// 1. Initialize the Client
// This connects to the Waku network and starts listening for Broadcasters.
const chain = { type: 0, id: 1 }; // Ethereum Mainnet
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
const statusCallback = (status) => console.log(status);

await WakuBroadcasterClient.start(chain, broadcasterOptions, statusCallback);

// 2. Wait for Broadcasters
// It takes a few seconds to discover peers and receive fee updates.
// You might want to wait or poll until broadcasters are available.

// 3. Find the Best Broadcaster
// Search for a broadcaster that accepts a specific token (e.g., DAI).
const tokenAddress = '0x...'; // DAI Address
const selectedBroadcaster = await WakuBroadcasterClient.findBestBroadcaster(
    chain,
    tokenAddress
);

if (!selectedBroadcaster) {
    throw new Error('No broadcaster found for this token');
}

// 4. Create and Send a Transaction
// Assuming you have a RAILGUN transaction ready to send.
const txidVersion = 'V2_PoseidonMerkle';
const to = '0x...';
const data = '0x...';
const nullifiers = ['0x...'];
const overallBatchMinGasPrice = 1000000000n;
const useRelayAdapt = false;
const preTransactionPOIs = {};

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

// Send the transaction to the broadcaster via Waku
const txResponse = await BroadcasterTransaction.send(broadcasterTransaction);

console.log('Transaction sent:', txResponse);
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

## Development

### Prerequisites
-   Node.js (v16+)
-   Yarn

### Setup
Clone the repository and install dependencies:

```bash
git clone https://github.com/Railgun-Community/waku-broadcaster-client.git
cd waku-broadcaster-client
yarn install
```

### Building
To build all packages:

```bash
yarn build
```

### Testing
To run unit tests:

```bash
yarn test
```

## License

MIT

