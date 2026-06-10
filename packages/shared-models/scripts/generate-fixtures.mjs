// Generates the golden wire-format fixtures for @zeno/shared-models.
// Run from the package directory: node scripts/generate-fixtures.mjs
//
// Canonicalization here is an independent reference implementation of the
// spec rule (RFC 8785 restricted to safe integers): object keys sorted by
// Unicode code point recursively, JSON.stringify escaping, no whitespace.
// The package implementation must reproduce these bytes exactly; so must a
// Rust Solver using serde_jcs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed from '@noble/ed25519';

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Object.is(value, -0) || value < 0 || value >= 2 ** 53) {
      throw new Error(`non-canonical number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).toSorted();
    const members = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${members.join(',')}}`;
  }
  throw new Error(`unsupported type: ${typeof value}`);
}

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const pubkeyOf = async (skHex) => hex(await ed.getPublicKeyAsync(Buffer.from(skHex, 'hex')));

async function signedFixture(name, privKeyHex, data) {
  const canonical = canonicalize(data);
  const sk = Buffer.from(privKeyHex, 'hex');
  const signature = hex(await ed.signAsync(Buffer.from(canonical, 'utf8'), sk));
  return {
    name,
    privateKey: privKeyHex,
    publicKey: await pubkeyOf(privKeyHex),
    data,
    canonical,
    signature,
    message: { data, signature },
  };
}

const SOLVER_SK = '11'.repeat(32);
const INTENT_EPH_SK = '22'.repeat(32);

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const CHAIN = { id: 1, type: 0 };

const NOW = 1781100000000; // fixed reference clock for all fixtures

async function main() {
  const solverPub = await pubkeyOf(SOLVER_SK);
  const intentEphPub = await pubkeyOf(INTENT_EPH_SK);

  const solverAd = await signedFixture('solver-ad', SOLVER_SK, {
    chain: CHAIN,
    expiry: NOW + 300000,
    reliability: 9800,
    solverPubkey: solverPub,
    supportedPairs: [
      { buyToken: USDC, minSellAmount: '0x16345785d8a0000', sellToken: WETH },
      { buyToken: WETH, minSellAmount: '0x3b9aca00', sellToken: USDC },
    ],
    supportedPools: ['railgun-v2'],
    version: '0.1.0',
  });

  const intent = await signedFixture('intent', INTENT_EPH_SK, {
    allowedPools: ['railgun-v2'],
    buyToken: USDC,
    chain: CHAIN,
    deadline: NOW + 600000,
    escrowParams: {
      committeePubkeys: ['aa'.repeat(48), 'bb'.repeat(48), 'cc'.repeat(48)],
      pool: 'railgun-v2',
      refundDeadline: NOW + 86400000,
      threshold: 2,
    },
    expiry: NOW + 60000,
    intentEphPubkey: intentEphPub,
    intentId: '00112233445566778899aabbccddeeff',
    sellAmount: '0xde0b6b3a7640000',
    sellToken: WETH,
  });

  const quoteData = {
    name: 'quote-data',
    data: {
      buyAmount: '0xb2d05e00',
      intentId: '00112233445566778899aabbccddeeff',
      reliability: 9800,
      solverPubkey: solverPub,
      solverSetupPubkey: await pubkeyOf('33'.repeat(32)),
      validUntil: NOW + 15000,
    },
  };

  // Schema-shape fixture only: a real cross-implementation ECIES fixture is
  // generated in Phase 6, where @railgun-community/wallet is in scope.
  const quoteEnvelope = {
    name: 'quote-envelope',
    message: {
      pubkey: await pubkeyOf('44'.repeat(32)),
      encryptedData: [`0x${'a1'.repeat(16)}${'b2'.repeat(16)}`, `0x${'c3'.repeat(64)}`],
    },
  };

  const winnerNotifyData = {
    name: 'winner-notify-data',
    data: {
      accept: true,
      intentId: '00112233445566778899aabbccddeeff',
      pairId: 'ffeeddccbbaa99887766554433221100',
      senderSetupPubkey: await pubkeyOf('55'.repeat(32)),
    },
  };

  const setupRound = {
    name: 'setup-round',
    message: {
      ciphertext: `0x${'d4'.repeat(96)}`,
      counter: 0,
      direction: 0,
      pairId: 'ffeeddccbbaa99887766554433221100',
      round: 1,
    },
  };

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'tests', 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const fixtures = { solverAd, intent, quoteData, quoteEnvelope, winnerNotifyData, setupRound };
  for (const [key, value] of Object.entries(fixtures)) {
    writeFileSync(join(outDir, `${value.name ?? key}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
}

await main();
