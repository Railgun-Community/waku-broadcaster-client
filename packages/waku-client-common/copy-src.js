const FS = require('fs');
const Path = require('path');

function copyDirectoryWithLinks(src, dst) {
  if (!FS.existsSync(dst)) {
    FS.mkdirSync(dst);
  }
  for (const file of FS.readdirSync(src)) {
    const srcPath = Path.join(src, file);
    const dstPath = Path.join(dst, file);

    if (FS.lstatSync(srcPath).isDirectory()) {
      if (!FS.existsSync(dstPath)) {
        FS.mkdirSync(dstPath);
      }
      copyDirectoryWithLinks(srcPath, dstPath);
    } else if (FS.existsSync(dstPath)) {
      continue;
    } else {
      FS.symlinkSync(srcPath, dstPath);
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
