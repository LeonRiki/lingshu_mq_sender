const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isUpdateAllowedPath } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_FILE = 'update-manifest.json';
const BLOCKED_TOP_LEVEL_DIRECTORIES = new Set(['docs', 'test']);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readManifest(root = ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_FILE), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files)) {
    throw new Error('更新清单格式无效');
  }
  return manifest;
}

function releasePaths(manifest) {
  const paths = new Set([MANIFEST_FILE]);
  for (const file of manifest.files) {
    const rel = String(file?.path || '').replace(/\\/g, '/');
    if (!isUpdateAllowedPath(rel)) throw new Error(`更新清单包含不允许发布的文件：${rel}`);
    paths.add(rel);
  }
  return [...paths].sort();
}

function assertSourceFiles(root, manifest, paths) {
  for (const rel of paths) {
    const source = path.join(root, rel);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`发布源文件不存在：${rel}`);
    }
  }
  for (const file of manifest.files) {
    const actual = sha256(path.join(root, file.path));
    if (actual !== file.sha256) throw new Error(`更新清单哈希不匹配：${file.path}`);
  }
}

function listFiles(root, current = '') {
  const directory = path.join(root, current);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(current, entry.name);
    if (entry.isDirectory()) return listFiles(root, rel);
    if (entry.isFile()) return [rel];
    throw new Error(`发布目录包含不支持的条目：${rel}`);
  });
}

function assertReleaseDirectory(root, expectedPaths) {
  const actualPaths = listFiles(root).sort();
  const expected = [...expectedPaths].sort();
  if (actualPaths.join('\n') !== expected.join('\n')) {
    throw new Error('发布目录包含白名单之外的文件，或缺少发布文件');
  }
  for (const rel of actualPaths) {
    if (BLOCKED_TOP_LEVEL_DIRECTORIES.has(rel.split('/')[0])) {
      throw new Error(`发布目录不允许包含：${rel}`);
    }
  }
}

function copyReleaseDirectory(sourceRoot, destinationRoot, paths) {
  fs.mkdirSync(destinationRoot, { recursive: true });
  for (const rel of paths) {
    const target = path.join(destinationRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, rel), target);
  }
  assertReleaseDirectory(destinationRoot, paths);
}

function prepareReleasePackage(outputDirectory, root = ROOT) {
  if (!outputDirectory) throw new Error('请指定空的发布输出目录');
  if (fs.existsSync(outputDirectory)) throw new Error(`发布输出目录已存在：${outputDirectory}`);

  const manifest = readManifest(root);
  const paths = releasePaths(manifest);
  assertSourceFiles(root, manifest, paths);

  const githubDirectory = path.join(outputDirectory, 'github');
  const modelscopeDirectory = path.join(outputDirectory, 'modelscope', 'v1');
  copyReleaseDirectory(root, githubDirectory, paths);
  copyReleaseDirectory(root, modelscopeDirectory, paths);

  return {
    version: manifest.version,
    files: paths,
    githubDirectory,
    modelscopeDirectory
  };
}

if (require.main === module) {
  const outputDirectory = process.argv[2];
  const result = prepareReleasePackage(outputDirectory);
  console.log(`已生成 v${result.version} 白名单发布目录，共 ${result.files.length} 个文件。`);
  console.log(`GitHub：${result.githubDirectory}`);
  console.log(`魔搭：${result.modelscopeDirectory}`);
}

module.exports = {
  assertReleaseDirectory,
  prepareReleasePackage,
  releasePaths
};
