import { defineConfig } from 'vitest/config';

const PACKAGES = [
  'shared-models',
  'crypto-wasm',
  'waku-client-common',
  'waku-client-node',
  'waku-client-web',
];

// Inherited Railgun mocha suites (src/**/__tests__, src/tests) are excluded until
// they are converted or replaced during transport extraction (Phase 3+).
export default defineConfig({
  test: {
    projects: PACKAGES.map((name) => ({
      test: {
        name,
        root: `packages/${name}`,
        include: ['smoke.test.ts', 'src/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', 'src/**/__tests__/**', 'src/tests/**'],
      },
    })),
  },
});
