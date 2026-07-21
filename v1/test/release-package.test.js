const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepareReleasePackage, releasePaths } = require('../scripts/prepare-release-package');

const ROOT = path.resolve(__dirname, '..');

test('白名单发布目录不包含 docs 或 test', () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lingshu-release-package-')), 'release');
  try {
    const manifest = require('../update-manifest.json');
    const result = prepareReleasePackage(output, ROOT);
    const expected = releasePaths(manifest);

    assert.deepEqual(result.files, expected);
    for (const directory of [result.githubDirectory, result.modelscopeDirectory]) {
      const files = listFiles(directory);
      assert.deepEqual(files, expected);
      assert.equal(files.some(file => file.startsWith('docs/') || file.startsWith('test/')), false);
    }
  } finally {
    fs.rmSync(path.dirname(output), { recursive: true, force: true });
  }
});

function listFiles(root, current = '') {
  return fs.readdirSync(path.join(root, current), { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, rel) : [rel];
  }).sort();
}
