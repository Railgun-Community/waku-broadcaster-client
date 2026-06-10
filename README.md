# waku-client-zeno

TypeScript SDK for the Zeno Waku protocol v0: intent broadcast, solver quote discovery, and encrypted escrow-setup sessions over the [Waku](https://waku.org/) peer-to-peer network.

Forked from [Railgun-Community/waku-broadcaster-client](https://github.com/Railgun-Community/waku-broadcaster-client), whose Waku LightNode transport pattern this SDK builds on.

## Status

Pre-release. Under active development; APIs and wire formats are not yet stable.

## Packages

| Package                    | Description                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `@zeno/shared-models`      | Wire-format schemas, codecs, validators, and protocol constants                          |
| `@zeno/waku-client-common` | Shared transport core: LightNode lifecycle, topics, discovery, intents, quotes, sessions |
| `@zeno/waku-client-node`   | Node.js entrypoint (servers, Electron, scripts)                                          |
| `@zeno/waku-client-web`    | Browser entrypoint (dApps, web wallets)                                                  |
| `@zeno/crypto-wasm`        | Rust cryptography (SWE, DLEQ, Pedersen) compiled to Wasm with a typed TS facade          |

## Development

Requires Node 22 (pinned via [Volta](https://volta.sh/)) and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm fmt:check
pnpm typecheck
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow.

## License

MIT
