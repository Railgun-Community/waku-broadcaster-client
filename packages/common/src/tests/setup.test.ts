/* eslint-disable no-console */
import LevelDOWN from 'leveldown';
import fs from 'fs';
import { ArtifactStore, startRailgunEngine } from '@railgun-community/wallet';

const TEST_DB = 'test.db';
// @ts-ignore
const db = new LevelDOWN(TEST_DB);

before(() => {});

after(() => {
  db.close((err: any) => {
    if (err) console.warn('Error closing test db.', err);
    fs.rm(TEST_DB, { recursive: true }, (err: any) => {
      if (err) console.warn('Error removing test db.', err);
    });
  });
});

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

export const initTestEngine = (useNativeArtifacts = false) => {
  const shouldDebug = true;
  startRailgunEngine(
    'TESTS',
    db,
    shouldDebug,
    testArtifactStore,
    useNativeArtifacts,
    false, // skipMerkletreeScans
    ['mock-poi-url'], // poiNodeURLs
  );
};
