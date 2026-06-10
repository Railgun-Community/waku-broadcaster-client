import { describe, expect, test } from 'vitest';
import { createAllowlist } from './trusted-solver-allowlist.js';

const solverA = 'aa'.repeat(32);
const solverB = 'bb'.repeat(32);

describe('createAllowlist', () => {
  test('off mode (the default) passes everyone', () => {
    expect(createAllowlist().check(solverA)).toBe(true);
    expect(createAllowlist({ mode: 'off' }).check(solverB)).toBe(true);
  });

  test('allow mode passes only listed solvers', () => {
    const allowlist = createAllowlist({ mode: 'allow', keys: [solverA] });
    expect(allowlist.check(solverA)).toBe(true);
    expect(allowlist.check(solverB)).toBe(false);
  });

  test('deny mode drops listed solvers', () => {
    const allowlist = createAllowlist({ mode: 'deny', keys: [solverA] });
    expect(allowlist.check(solverA)).toBe(false);
    expect(allowlist.check(solverB)).toBe(true);
  });

  test('runtime mutation applies to subsequent checks', () => {
    const allowlist = createAllowlist();
    expect(allowlist.check(solverB)).toBe(true);
    allowlist.set('deny', [solverB]);
    expect(allowlist.check(solverB)).toBe(false);
    allowlist.set('off');
    expect(allowlist.check(solverB)).toBe(true);
  });
});
