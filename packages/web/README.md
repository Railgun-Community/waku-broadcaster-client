# RAILGUN Broadcaster Client with Waku networking layer

This package is meant specifically for browsers.

`yarn add @railgun-community/waku-broadcaster-client-web`

## The Basics

```js
// Initialize the Broadcaster Client
await WakuBroadcasterClient.start(...)

// Wait for Broadcasters to connect (5-10 sec) and client to collect fees.
// Broadcasters broadcast fees through the privacy-safe Waku network.

// Get broadcaster with lowest fee for a given ERC20 token.
const selectedBroadcaster = await WakuBroadcasterClient.findBestBroadcaster(...)

// Create Relayed transaction and send through selected Broadcaster.
const relayerTransaction = await BroadcasterTransaction.create(...)
await BroadcasterTransaction.send(...)
```

## Webpack configuration

Some dependencies of this package, such as Waku and libp2p, make an assumption that they are running in a Node.js environment. This is not the case in a browser environment, so we need to configure Webpack to ignore some sub-dependencies that are not relevant in the browser.

**webpack.config.js**

```js
module.exports = {
  //...
  resolve: {
    alias: {
      // Waku uses these Node.js-specific sub-dependencies, which we ignore:
      'default-gateway': false,
      '@achingbrain/nat-port-mapper': false,
    },
  },
};
```

If you are using _Next.js_:

```js
/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config, options) => {
    if (options.isServer) {
      // If your Next.js component is running in the server, we need to avoid
      // loading a WASM module.
      config.resolve.alias['@railgun-community/curve25519-scalarmult-wasm'] =
        '@railgun-community/curve25519-scalarmult-rsjs';
    } else {
      // If your Next.js component is running in the browser, we need to avoid
      // loading some modules which call Node.js APIs such as `child_process`.
      config.resolve.alias['default-gateway'] = false;
      config.resolve.alias['@achingbrain/nat-port-mapper'] = false;
    }
    return config;
  },
};
```
