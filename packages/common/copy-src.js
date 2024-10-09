const FS = require('fs');
const Path = require('path');

function copyDirectoryWithLinks(src, dst) {
  if (!FS.existsSync(dst)) {
    FS.mkdirSync(dst, { recursive: true });
  }
  for (const file of FS.readdirSync(src)) {
    const srcPath = Path.join(src, file);
    const dstPath = Path.join(dst, file);

    if (FS.lstatSync(srcPath).isDirectory()) {
      copyDirectoryWithLinks(srcPath, dstPath);
    } else if (FS.lstatSync(srcPath).isSymbolicLink()) {
      const linkTarget = FS.readlinkSync(srcPath);
      try {
        FS.symlinkSync(linkTarget, dstPath);
      } catch (err) {
        if (err.code === 'EEXIST') {
          // If the symlink already exists, remove it and create a new one
          FS.unlinkSync(dstPath);
          FS.symlinkSync(linkTarget, dstPath);
        } else {
          throw err;
        }
      }
    } else {
      FS.copyFileSync(srcPath, dstPath);
    }
  }
}

const packages = Path.resolve(__dirname, '..');
for (const package of ['node', 'web']) {
  copyDirectoryWithLinks(
    Path.join(packages, 'common', 'src'),
    Path.join(packages, package, 'src'),
  );
}
