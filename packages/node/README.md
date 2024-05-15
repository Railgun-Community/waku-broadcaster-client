# RAILGUN Broadcaster Client with Waku networking layer

This package is meant specifically for Node.js.

`yarn add @railgun-community/waku-broadcaster-client-node`

## The Basics

```js
// Initialize the Broadcasting Client
await WakuBroadcastClient.start(...)

// Wait for connection (5-10 sec) and client to collect accepted gas ratios.
// Broadcasts fees through the privacy-safe Waku network.

// Get broadcast with lowest fee for a given ERC20 token.
const selectedBroadcast = await WakuBroadcastClient.findBestBroadcast(...)

// Create transaction and send through selected Broadcaster.
const broadcastTransaction = await BroadcastTransaction.create(...)
await BroadcastTransaction.send(...)
```
