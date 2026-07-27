const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}

function prepareReleaseVersion(version) {
  if (!VERSION_PATTERN.test(version || '')) {
    throw new Error('版本号必须为 x.y.z 格式，例如 2.1.1');
  }

  const packageFile = path.join(ROOT, 'package.json');
  const lockFile = path.join(ROOT, 'package-lock.json');
  const versionFile = path.join(ROOT, 'version.json');
  const packageJson = readJson(packageFile);
  const packageLock = readJson(lockFile);
  const versionJson = readJson(versionFile);

  packageJson.version = version;
  packageLock.version = version;
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = version;
  }
  versionJson.version = version;

  writeJson(packageFile, packageJson);
  writeJson(lockFile, packageLock);
  writeJson(versionFile, versionJson);

  run('npm', ['run', 'build']);
  run('npm', ['run', 'release:manifest']);
  console.log(`已准备 v${version}：版本文件、前端构建产物和更新清单均已更新。`);
}

if (require.main === module) {
  prepareReleaseVersion(process.argv[2]);
}

module.exports = { prepareReleaseVersion };
