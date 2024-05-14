[![Unit Tests](https://github.com/Railgun-Community/waku-broadcaster-client/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/Railgun-Community/waku-broadcaster-client/actions)

# RAILGUN Broadcaster Client with Waku networking layer

- [Node.js-specific package](./packages/node/README.md)
- [Browser-specific package](./packages/web/README.md)

`yarn add @railgun-community/waku-broadcaster-client-node`

OR

`yarn add @railgun-community/waku-broadcaster-client-web`

## The Basics

```js
// Initialize the Broadcaster Client
await WakuRelayerClient.start(...)

// Wait for Relayers to connect (5-10 sec) and client to collect fees.
// Relayers broadcast fees through the privacy-safe Waku network.

// Get broadcaster with lowest fee for a given ERC20 token.
const selectedRelayer = await WakuRelayerClient.findBestRelayer(...)

// Create Relayed transaction and send through selected Broadcaster.
const relayerTransaction = await RelayerTransaction.create(...)
await RelayerTransaction.send(...)
```
