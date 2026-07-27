const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareReleaseArchive, prepareReleasePackage } = require('./prepare-release-package');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = 'LeonRiki/lingshu_mq_sender';
const MODELSCOPE_REPOSITORY = 'LeonRiki/lingshu_mq';
const GITHUB_PACKAGE_BRANCH = 'main';
const GITHUB_SOURCE_EXCLUDED_DIRECTORIES = new Set(['docs', 'test']);
const MODELSCOPE_PYTHON_CACHE = path.join(
  os.homedir(),
  'Library',
  'Caches',
  'lingshu-mq-release-tools',
  'modelscope'
);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env
  });
}

function runInherited(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: 'inherit',
    env: options.env || process.env
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assertCleanTrackedTree() {
  const changes = run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: path.resolve(ROOT, '..') }).trim();
  if (changes) {
    throw new Error('发布前请先提交已跟踪文件的改动，避免发布包与源码提交不一致。');
  }
}

function releaseVersion() {
  const packageVersion = String(readJson(path.join(ROOT, 'package.json')).version || '');
  const lockVersion = String(readJson(path.join(ROOT, 'package-lock.json')).version || '');
  const version = String(readJson(path.join(ROOT, 'version.json')).version || '');
  if (!/^\d+\.\d+\.\d+$/.test(version) || packageVersion !== version || lockVersion !== version) {
    throw new Error('package.json、package-lock.json 与 version.json 的版本号必须一致。');
  }
  return version;
}

function assertPreparedRelease(version) {
  runInherited('npm', ['run', 'build']);
  runInherited('npm', ['run', 'release:manifest']);
  const changes = run('git', ['diff', '--name-only'], { cwd: path.resolve(ROOT, '..') }).trim();
  if (changes) {
    throw new Error('构建或生成更新清单后产生未提交改动。请先运行 release:prepare-version，提交全部发布代码后再发布。');
  }
  const manifest = readJson(path.join(ROOT, 'update-manifest.json'));
  if (manifest.version !== version) throw new Error('更新清单版本与 version.json 不一致。');
  return manifest;
}

function temporaryOutput(version) {
  return path.join(os.tmpdir(), `lingshu-mq-v${version}-${Date.now()}-${process.pid}`);
}

function githubToken() {
  const token = run('gh', ['auth', 'token'], { cwd: path.resolve(ROOT, '..') }).trim();
  if (!token) throw new Error('未检测到 GitHub 登录状态，请先执行 gh auth login。');
  return token;
}

async function githubApi(token, apiPath, options = {}) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = body?.message || text || response.statusText;
    const error = new Error(`GitHub API ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function githubSourceFiles() {
  const paths = run('git', ['ls-files', '-z'], { encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(relativePath => !GITHUB_SOURCE_EXCLUDED_DIRECTORIES.has(relativePath.split('/')[0]))
    .sort();
  if (!paths.includes('server.js') || !paths.includes('update-manifest.json') || !paths.includes('web/detail-ui.jsx')) {
    throw new Error('GitHub 源码缺少必要的 v1 源文件');
  }
  return paths.map(relativePath => ({
    relativePath,
    content: fs.readFileSync(path.join(ROOT, relativePath))
  }));
}

async function publishGithubSource(token, version) {
  const ref = await githubApi(token, `/repos/${REPOSITORY}/git/ref/heads/${GITHUB_PACKAGE_BRANCH}`);
  const files = githubSourceFiles();
  const blobs = await Promise.all(files.map(async file => {
    const blob = await githubApi(token, `/repos/${REPOSITORY}/git/blobs`, {
      method: 'POST',
      body: { content: file.content.toString('base64'), encoding: 'base64' }
    });
    return {
      path: file.relativePath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    };
  }));
  const tree = await githubApi(token, `/repos/${REPOSITORY}/git/trees`, {
    method: 'POST',
    body: { tree: blobs }
  });
  const commit = await githubApi(token, `/repos/${REPOSITORY}/git/commits`, {
    method: 'POST',
    body: {
      message: `release: v${version} update package`,
      tree: tree.sha,
      parents: [ref.object.sha]
    }
  });
  await githubApi(token, `/repos/${REPOSITORY}/git/refs/heads/${GITHUB_PACKAGE_BRANCH}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: true }
  });
  return { sha: commit.sha, files };
}

async function createGithubRelease(token, version, sourceCommit) {
  const tag = `v${version}`;
  try {
    return await githubApi(token, `/repos/${REPOSITORY}/releases`, {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: sourceCommit,
        name: tag,
        generate_release_notes: true
      }
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    return githubApi(token, `/repos/${REPOSITORY}/releases/tags/${tag}`);
  }
}

async function removeGithubReleaseAndTag(token, version) {
  const tag = `v${version}`;
  try {
    const release = await githubApi(token, `/repos/${REPOSITORY}/releases/tags/${tag}`);
    await githubApi(token, `/repos/${REPOSITORY}/releases/${release.id}`, { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  try {
    await githubApi(token, `/repos/${REPOSITORY}/git/refs/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 422 && error.status !== 404) throw error;
  }
}

async function replaceGithubReleaseAsset(token, release, archivePath) {
  const fileName = path.basename(archivePath);
  const assets = await githubApi(token, `/repos/${REPOSITORY}/releases/${release.id}/assets?per_page=100`);
  const oldAsset = assets.find(asset => asset.name === fileName);
  if (oldAsset) {
    await githubApi(token, `/repos/${REPOSITORY}/releases/assets/${oldAsset.id}`, { method: 'DELETE' });
  }

  const uploadUrl = String(release.upload_url || '').replace(/\{\?.*$/, '');
  if (!uploadUrl) throw new Error('GitHub Release 未返回附件上传地址');
  const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: fs.readFileSync(archivePath)
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try { detail = JSON.parse(text)?.message || text; } catch {}
    throw new Error(`GitHub Release 附件上传失败 ${response.status}: ${detail}`);
  }
  return JSON.parse(text);
}

function modelscopeEnvironment() {
  return {
    ...process.env,
    PYTHONPATH: [MODELSCOPE_PYTHON_CACHE, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
  };
}

function hasModelscopeSdk() {
  try {
    run('python3', ['-c', 'from modelscope.hub.api import HubApi'], { env: modelscopeEnvironment() });
    return true;
  } catch {
    return false;
  }
}

function ensureModelscopeSdk() {
  if (hasModelscopeSdk()) return;
  fs.mkdirSync(MODELSCOPE_PYTHON_CACHE, { recursive: true });
  console.log('首次发布：正在缓存魔搭发布 SDK，后续发布不会重复安装。');
  runInherited('python3', [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--target', MODELSCOPE_PYTHON_CACHE, 'modelscope'
  ]);
  if (!hasModelscopeSdk()) throw new Error('魔搭发布 SDK 安装后仍不可用。');
}

function publishModelscope(directory, version) {
  const script = path.join(__dirname, 'modelscope-publish.py');
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [script, '--directory', directory, '--version', version, '--repo', MODELSCOPE_REPOSITORY], {
      cwd: ROOT,
      env: modelscopeEnvironment(),
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`魔搭发布失败，退出码 ${code}`)));
  });
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`下载校验文件失败 ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function verifyRemotePackage(name, baseUrl, prefix, manifest) {
  const verificationKey = `verify=${Date.now()}`;
  const fileUrl = relativePath => {
    const url = `${baseUrl}${baseUrl.endsWith('=') ? '' : '/'}${prefix}${relativePath}`;
    return `${url}${url.includes('?') ? '&' : '?'}${verificationKey}`;
  };
  const remoteManifest = JSON.parse((await fetchBytes(fileUrl('update-manifest.json'))).toString('utf8'));
  if (remoteManifest.version !== manifest.version) {
    throw new Error(`${name} 更新清单版本不正确：${remoteManifest.version}`);
  }
  await mapConcurrent(manifest.files, 8, async file => {
    const actual = sha256(await fetchBytes(fileUrl(file.path)));
    if (actual !== file.sha256) throw new Error(`${name} 文件校验失败：${file.path}`);
  });
}

async function verifyGithubSource(manifest) {
  const files = githubSourceFiles();
  await mapConcurrent(files, 8, async file => {
    const remote = await fetchBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${GITHUB_PACKAGE_BRANCH}/${file.relativePath.split('/').map(encodeURIComponent).join('/')}?verify=${Date.now()}`);
    if (!remote.equals(file.content)) throw new Error(`GitHub 源码校验失败：${file.relativePath}`);
  });
  await verifyRemotePackage('GitHub', `https://raw.githubusercontent.com/${REPOSITORY}/main`, '', manifest);
}

async function publishRelease({ dryRun = false, replaceRelease = false } = {}) {
  assertCleanTrackedTree();
  const version = releaseVersion();
  const manifest = assertPreparedRelease(version);
  const outputDirectory = temporaryOutput(version);
  const packageResult = prepareReleasePackage(outputDirectory);
  const archiveResult = prepareReleaseArchive(path.join(outputDirectory, 'release-archive'));
  console.log(`已生成 v${version} 发布包，共 ${packageResult.files.length} 个运行时文件。`);

  if (dryRun) {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    console.log('发布预检通过，未推送源码或更新任一远端。');
    return;
  }

  const token = githubToken();
  ensureModelscopeSdk();
  try {
    console.log('正在发布 GitHub 源码与更新包…');
    const modelscopePromise = publishModelscope(path.join(outputDirectory, 'modelscope'), version);
    const githubSource = await publishGithubSource(token, version);
    if (replaceRelease) await removeGithubReleaseAndTag(token, version);
    const release = await createGithubRelease(token, version, githubSource.sha);

    console.log('正在更新 GitHub Release 运行包…');
    await replaceGithubReleaseAsset(token, release, archiveResult.archivePath);

    console.log('正在校验 GitHub 源码与更新包…');
    await verifyGithubSource(manifest);

    console.log('正在校验魔搭更新包…');
    await modelscopePromise;
    await verifyRemotePackage('魔搭', `https://www.modelscope.cn/api/v1/models/${MODELSCOPE_REPOSITORY}/repo?Revision=master&FilePath=`, 'v1/', manifest);
    console.log(`发布完成：v${version}`);
    console.log(`GitHub 源码与更新包提交：${githubSource.sha}`);
    console.log(`GitHub Release：${release.html_url}`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  publishRelease({
    dryRun: process.argv.includes('--dry-run'),
    replaceRelease: process.argv.includes('--replace-release')
  }).catch(error => {
    console.error(`发布失败：${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { githubSourceFiles, publishRelease, verifyRemotePackage };
