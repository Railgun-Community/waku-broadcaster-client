import chai from 'chai';
import {
  getSessionSeed,
  resetSessionSeedForTests,
  sessionRankDigest,
  setSessionSeedForTests,
} from '../session-seed.js';

const { expect } = chai;

// HMAC-SHA-256('0xTESTSEED', 'abc') and HMAC-SHA-256('0xTESTSEED', 'abd'),
// cross-checked against Node's crypto.createHmac.
const KNOWN_DIGEST_ABC = '0bbbfc6d02c05c3432059eded47d6a59e20bcec528a313d92300bb19cd216398';
const KNOWN_DIGEST_ABD = '7137efe4e7ac11c26c09ad2a5071710aa76ff7ba4befaaab351ded1eaa72265d';

describe('session-seed', () => {
  beforeEach(() => {
    resetSessionSeedForTests();
  });

  afterEach(() => {
    resetSessionSeedForTests();
  });

  it('Should generate a 64-character hex seed once and keep it stable', () => {
    const first = getSessionSeed();
    expect(first).to.match(/^[0-9a-f]{64}$/);
    expect(getSessionSeed()).to.equal(first);
    expect(getSessionSeed()).to.equal(first);
  });

  it('Should generate a valid 64-character hex seed on each fresh generation', () => {
    for (let i = 0; i < 3; i++) {
      resetSessionSeedForTests();
      expect(getSessionSeed()).to.match(/^[0-9a-f]{64}$/);
    }
  });

  it('Should honor a pinned seed and regenerate after reset', () => {
    setSessionSeedForTests('0xPINNEDSEED');
    expect(getSessionSeed()).to.equal('0xPINNEDSEED');

    resetSessionSeedForTests();
    const regenerated = getSessionSeed();
    expect(regenerated).to.match(/^[0-9a-f]{64}$/);
  });

  it('Should produce a deterministic fixed-width HMAC-SHA-256 digest', () => {
    setSessionSeedForTests('0xTESTSEED');
    const input =
      '0:1:0x1234567890123456789012345678901234567890:100:0xBroadcaster1';
    const first = sessionRankDigest(input);
    expect(first).to.match(/^[0-9a-f]{64}$/);
    expect(sessionRankDigest(input)).to.equal(first);
  });

  it('Should produce the known HMAC-SHA-256 digest for a pinned seed', () => {
    setSessionSeedForTests('0xTESTSEED');
    expect(sessionRankDigest('abc')).to.equal(KNOWN_DIGEST_ABC);
    expect(sessionRankDigest('abd')).to.equal(KNOWN_DIGEST_ABD);
    expect(sessionRankDigest('abc')).to.not.equal(sessionRankDigest('abd'));
  });

  it('Should produce different digests for the same input under different seeds', () => {
    setSessionSeedForTests('0xTESTSEED');
    const first = sessionRankDigest('abc');
    setSessionSeedForTests('0xOTHERSEED');
    const second = sessionRankDigest('abc');
    expect(second).to.match(/^[0-9a-f]{64}$/);
    expect(second).to.not.equal(first);
  });
});
