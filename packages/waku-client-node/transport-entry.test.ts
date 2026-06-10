import { describe, expect, test } from 'vitest';

// The Node entrypoint must provide the platform pieces the common transport
// abstracts over: a LightNode factory and a LevelDOWN-compatible persistence
// for the replay-drop set. Red until Phase 3 Step 3 lands the entrypoint.
describe('@zeno/waku-client-node transport entrypoint', () => {
  test('exposes the Node platform bindings', async () => {
    const entry = (await import('./src/transport-entry.js')) as Record<string, unknown>;
    expect(typeof entry['createNodeLightNode']).toBe('function');
    expect(typeof entry['createLevelHandledKeysPersistence']).toBe('function');
  });
});
