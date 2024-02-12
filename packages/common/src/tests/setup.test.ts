import LevelDOWN from 'leveldown';
import fs from 'fs';
import { ArtifactStore, startRailgunEngine } from '@railgun-community/wallet';

const fileExists = (path: string): Promise<boolean> => {
  return new Promise(resolve => {
    fs.promises
      .access(path)
      .then(() => resolve(true))
      .catch(() => resolve(false));
  });
};

const testArtifactStore = new ArtifactStore(
  fs.promises.readFile,
  async (dir, path, data) => {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path, data);
  },
  fileExists,
);

export const initTestEngine = async (useNativeArtifacts = false) => {
  const TEST_DB = 'test.db';
  if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB, { recursive: true });

  await startRailgunEngine(
    'TESTS',
    // @ts-ignore
    new LevelDOWN(TEST_DB),
    true, // shouldDebug
    testArtifactStore,
    useNativeArtifacts,
    false, // skipMerkletreeScans
    ['mock-poi-url'], // poiNodeURLs
  );
};
