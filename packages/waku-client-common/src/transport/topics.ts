import { ZENO_PROTOCOL_VERSION } from '@zeno/shared-models';

/** Chain scope used in topic names (mirrors shared-models ChainRef). */
export interface TopicChain {
  id: number;
  type: number;
}

export type ParsedTopic =
  | { kind: 'default' }
  | { kind: 'solvers'; chain: TopicChain }
  | { kind: 'intents'; chain: TopicChain }
  | { kind: 'quotes'; chain: TopicChain; intentId: string }
  | { kind: 'winner'; chain: TopicChain }
  | { kind: 'setup'; pairId: string }
  | { kind: 'encrypted'; name: string };

/**
 * Waku `ephemeral` flag per message kind (spec section 5): ads and heartbeats
 * are not Store-persisted; everything on the intent/quote/setup path is, since
 * Store backfill is the retry mechanism.
 */
export const EPHEMERAL_BY_KIND: Record<ParsedTopic['kind'], boolean> = {
  default: true,
  solvers: true,
  intents: false,
  quotes: false,
  winner: false,
  setup: false,
  encrypted: false,
};

const PREFIX = `/zeno/${ZENO_PROTOCOL_VERSION}/`;
const SUFFIX = '/json';

const topic = (name: string): string => `${PREFIX}${name}${SUFFIX}`;
const chainScope = (chain: TopicChain): string => `${chain.type}-${chain.id}`;

export const topicForDefault = (): string => topic('default');
export const topicForSolvers = (chain: TopicChain): string => topic(`${chainScope(chain)}-solvers`);
export const topicForIntents = (chain: TopicChain): string => topic(`${chainScope(chain)}-intents`);
export const topicForQuotes = (chain: TopicChain, intentId: string): string =>
  topic(`${chainScope(chain)}-quote-${intentId}`);
export const topicForWinner = (chain: TopicChain): string => topic(`${chainScope(chain)}-winner`);
export const topicForSetup = (pairId: string): string => topic(`setup-${pairId}`);
export const topicForEncrypted = (name: string): string => topic(`encrypted-${name}`);

const SETUP_RE = /^setup-([0-9a-f]{32})$/;
const ENCRYPTED_RE = /^encrypted-([A-Za-z0-9-]+)$/;
const CHAIN_KIND_RE = /^(\d+)-(\d+)-(solvers|intents|winner)$/;
const QUOTE_RE = /^(\d+)-(\d+)-quote-([0-9a-f]{32})$/;

function parseChainName(name: string): ParsedTopic | undefined {
  const quote = QUOTE_RE.exec(name);
  if (quote !== null) {
    const [, type, id, intentId] = quote;
    return {
      kind: 'quotes',
      chain: { type: Number(type), id: Number(id) },
      intentId: intentId ?? '',
    };
  }
  const plain = CHAIN_KIND_RE.exec(name);
  if (plain !== null) {
    const [, type, id, kind] = plain;
    return {
      kind: kind as 'solvers' | 'intents' | 'winner',
      chain: { type: Number(type), id: Number(id) },
    };
  }
  return undefined;
}

/**
 * Parses a Zeno content topic. Returns undefined for anything outside the
 * exact grammar, including reserved prefixes with malformed ids (a topic that
 * starts with `setup-` is never reinterpreted as an `encrypted-` extension).
 */
export function parseTopic(value: string): ParsedTopic | undefined {
  if (!value.startsWith(PREFIX) || !value.endsWith(SUFFIX)) {
    return undefined;
  }
  const name = value.slice(PREFIX.length, -SUFFIX.length);
  if (name === 'default') {
    return { kind: 'default' };
  }
  if (name.startsWith('setup-')) {
    const match = SETUP_RE.exec(name);
    return match === null ? undefined : { kind: 'setup', pairId: match[1] ?? '' };
  }
  if (name.startsWith('encrypted-')) {
    const match = ENCRYPTED_RE.exec(name);
    return match === null ? undefined : { kind: 'encrypted', name: match[1] ?? '' };
  }
  return parseChainName(name);
}
