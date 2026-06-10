import { describe, expect, test } from 'vitest';

// The Web entrypoint must provide the platform pieces the common transport
// abstracts over: a LightNode factory and an IndexedDB persistence for the
// replay-drop set. Red until Phase 3 Step 3 lands the entrypoint.
describe('@zeno/waku-client-web transport entrypoint', () => {
  test('exposes the Web platform bindings', async () => {
    const entry = (await import('./src/transport-entry.js')) as Record<string, unknown>;
    expect(typeof entry['createWebLightNode']).toBe('function');
    expect(typeof entry['createIdbHandledKeysPersistence']).toBe('function');
  });
});
