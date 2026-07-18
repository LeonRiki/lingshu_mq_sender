const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');

const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');
const CASES_DIR = path.join(ROOT, 'cases');
const RECORDS_DIR = path.join(ROOT, 'records');
const CACHE_DIR = path.join(ROOT, 'cache');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const MQ_CONFIGS_FILE = path.join(CACHE_DIR, 'mq-configs.json');
const UPDATE_DIR = path.join(CACHE_DIR, 'updates');
const UPDATE_BACKUPS_DIR = path.join(UPDATE_DIR, 'backups');
const UPDATE_STAGING_DIR = path.join(UPDATE_DIR, 'staging');
const VERSION_FILE = path.join(ROOT, 'version.json');
const UPDATE_MANIFEST_ASSET = 'v1-update-manifest.json';
const UPDATE_SOURCES = [
  {
    key: 'github',
    label: 'GitHub',
    repository: 'LeonRiki/lingshu_mq_sender',
    contentRoot: 'v1',
    type: 'github-release'
  },
  {
    key: 'modelscope',
    label: '魔搭',
    repository: 'LeonRiki/lingshu_mq',
    contentRoot: 'v1',
    revision: 'main',
    type: 'modelscope-repository'
  }
];
const UPDATE_ROOT_FILES = new Set([
  '.env.example',
  'README.md',
  'mac-修复权限.command',
  'mac-启动服务.command',
  'package-lock.json',
  'package.json',
  'server.js',
  'version.json',
  'win-启动服务.bat'
]);
const UPDATE_PREFIXES = ['docs/', 'scripts/', 'web/'];
let updateInProgress = false;
const PROTOCOL_MESSAGE_FIELDS = [
  'requestId', 'input', 'latestMsgTime', 'weworkCorpId', 'agentId', 'addTime',
  'weworkAccount', 'friendNick', 'friendExternalId', 'tagList', 'inputList',
  'weworkAccountAlias', 'friendRemoteId'
];
const CSV_CASE_FIELD_SOURCES = {
  id: ['id'],
  request_time: ['request_time'],
  input: ['input'],
  skip_reason: ['skip_reason'],
  modelName: ['modelName'],
  inputList: ['inputList', 'history'],
  tagList: ['tagList']
};
const IMPORT_IGNORED_ID_FIELDS = ['requestId', 'weworkCorpId', 'weworkAccount', 'friendExternalId', 'friendRemoteId'];
const MQ_REQUIRED_ENV = ['MQ_GATEWAY_URL', 'MQ_APP_ID', 'MQ_TOPIC', 'MQ_PRODUCER_GROUP', 'MQ_SECRET_KEY', 'MQ_NAME_SERVER', 'MQ_MESSAGE_TYPE'];

const DEFAULT_CONFIG = {
  appName: 'AI 工作流消息测试平台',
  preferredPort: 32880,
  defaultAgentId: 'testId',
  defaultAlias: '汪洋老师',
  businessScenarios: [],
  userTags: [],
  sessionAttributeFields: [
    { key: 'agentId', label: '智能体ID', type: 'text' },
    { key: 'addTime', label: '添加时间', type: 'datetime-local' },
    { key: 'latestMsgTime', label: '最新消息时间', type: 'datetime-local' },
    { key: 'friendNick', label: '好友昵称', type: 'text' },
    { key: 'weworkAccountAlias', label: '企微账号别名', type: 'text' }
  ]
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const NAMES = ['JingLing', 'WuKong', 'BaiLong', 'TangSeng', 'ZhuBaJie', 'ShaSeng', 'YuDi', 'TaiBai', 'NiuMo', 'HongHai'];
const SUFFIXES = ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu'];
const NICKS = ['精灵王21', '孙悟空', '白龙马', '唐僧', '猪八戒', '沙和尚', '玉帝', '太白金星', '牛魔王', '红孩儿'];

function ensureDirs() {
  [WEB_DIR, CASES_DIR, RECORDS_DIR, CACHE_DIR, UPDATE_DIR, UPDATE_BACKUPS_DIR, UPDATE_STAGING_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  if (!fs.existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  if (fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).length === 0) {
    const sample = createEmptyCase('地址收集-一次性完整地址');
    sample.meta.expectedResult = '打标签-已填地址+追问上课时间';
    sample.message.input = ['张三 13812345678 北京市朝阳区建国路88号SOHO现代城A座1205'];
    sample.message.tagList = ['260710', '赠品单'];
    sample.message.inputList = [
      '1688858104791910:同学您好，我是带您学习竹笛的唯一班主任【汪洋老师】\n训练营为期6天，7月10日开始每晚6点50上课\n您购买的礼盒请填写地址安排发货：http://addr.example.com\n填写完毕回复：已填写'
    ];
    saveCase(sample);
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function writePrivateJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function updateError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function currentAppVersion() {
  const version = String(readJson(VERSION_FILE, {}).version || '').trim();
  if (version) return version;
  return String(readJson(path.join(ROOT, 'package.json'), {}).version || '0.0.0').trim();
}

function versionParts(value) {
  return String(value || '').match(/\d+/g)?.map(Number) || [];
}

function versionGreater(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta > 0;
  }
  return false;
}

function isUpdateAllowedPath(value) {
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return UPDATE_ROOT_FILES.has(rel) || UPDATE_PREFIXES.some(prefix => rel.startsWith(prefix));
}

function safeUpdatePath(baseDir, value) {
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!isUpdateAllowedPath(rel)) throw updateError(`更新文件不在允许范围：${rel}`);
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...rel.split('/'));
  if (!target.startsWith(`${base}${path.sep}`)) throw updateError(`更新路径不安全：${rel}`);
  return target;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validateUpdateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw updateError('更新清单格式无效');
  const version = String(value.version || '').trim();
  if (!version || !/\d/.test(version) || /[<>{}]/.test(version)) throw updateError('更新清单缺少有效版本号');
  const rawFiles = Array.isArray(value.files) ? value.files : [];
  if (!rawFiles.length || rawFiles.length > 500) throw updateError('更新清单未包含可更新文件');
  const seen = new Set();
  const files = rawFiles.map(item => {
    const file = item && typeof item === 'object' ? item : {};
    const rel = String(file.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const sha256 = String(file.sha256 || '').toLowerCase();
    if (!isUpdateAllowedPath(rel)) throw updateError(`更新清单包含不允许的文件：${rel}`);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw updateError(`更新清单缺少校验值：${rel}`);
    if (seen.has(rel)) throw updateError(`更新清单包含重复文件：${rel}`);
    seen.add(rel);
    return { path: rel, sha256 };
  });
  ['server.js', 'version.json', 'web/detail-ui.js'].forEach(required => {
    if (!seen.has(required)) throw updateError(`更新清单缺少必要文件：${required}`);
  });
  const notes = (Array.isArray(value.notes) ? value.notes : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map(item => item.slice(0, 300));
  return { version, files, notes };
}

async function fetchRemoteBuffer(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LingShu-MQ-Updater/1.0', ...(options.headers || {}) },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) throw updateError(`远端请求失败：HTTP ${response.status}`, 502);
    const contentLength = Number(response.headers.get('content-length') || 0);
    const maxBytes = options.maxBytes || 20 * 1024 * 1024;
    if (contentLength > maxBytes) throw updateError('远端文件超过大小限制', 502);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw updateError('远端文件超过大小限制', 502);
    return buffer;
  } catch (err) {
    if (err.statusCode) throw err;
    if (err.name === 'AbortError') throw updateError('连接更新源超时', 504);
    throw updateError(`无法连接更新源：${err.message}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGitHubJson(url) {
  const data = await fetchRemoteBuffer(url, {
    headers: { Accept: 'application/vnd.github+json' },
    maxBytes: 1024 * 1024
  });
  try {
    return JSON.parse(data.toString('utf8'));
  } catch (err) {
    throw updateError('GitHub 返回了无效的 JSON', 502);
  }
}

function parseRemoteVersion(buffer, sourceLabel) {
  const text = buffer.toString('utf8').trim();
  let version = '';
  try {
    version = String(JSON.parse(text)?.version || '').trim();
  } catch (err) {
    version = text.split(/\r?\n/)[0]?.trim() || '';
  }
  if (!version || !/\d/.test(version) || /[<>{}]/.test(version)) throw updateError(`${sourceLabel} 版本文件格式无效`, 502);
  return version;
}

function modelscopeFileUrl(source, rel) {
  const params = new URLSearchParams({
    Revision: source.revision,
    FilePath: `${source.contentRoot}/${rel}`
  });
  return `https://www.modelscope.cn/api/v1/models/${source.repository}/repo?${params}`;
}

async function getGitHubRelease(source) {
  const release = await fetchGitHubJson(`https://api.github.com/repos/${source.repository}/releases/latest`);
  const tag = String(release.tag_name || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(tag)) throw updateError('GitHub Release 标签格式不受支持', 502);
  const asset = (Array.isArray(release.assets) ? release.assets : []).find(item => item?.name === UPDATE_MANIFEST_ASSET);
  const expectedAssetUrl = `https://api.github.com/repos/${source.repository}/releases/assets/`;
  if (!asset || !String(asset.url || '').startsWith(expectedAssetUrl)) {
    throw updateError(`Release 缺少 ${UPDATE_MANIFEST_ASSET} 附件`, 502);
  }
  const manifestBuffer = await fetchRemoteBuffer(asset.url, {
    headers: { Accept: 'application/octet-stream' },
    maxBytes: 512 * 1024
  });
  let manifest;
  try {
    manifest = validateUpdateManifest(JSON.parse(manifestBuffer.toString('utf8')));
  } catch (err) {
    if (err.statusCode) throw err;
    throw updateError('更新清单不是有效 JSON', 502);
  }
  return {
    ...source,
    ref: tag,
    version: manifest.version,
    files: manifest.files,
    notes: manifest.notes,
    publishedAt: String(release.published_at || ''),
    releaseName: String(release.name || release.tag_name || ''),
    fileUrl: rel => `https://raw.githubusercontent.com/${source.repository}/${tag}/${source.contentRoot}/${rel.split('/').map(encodeURIComponent).join('/')}`
  };
}

async function getModelScopeRelease(source) {
  const version = parseRemoteVersion(await fetchRemoteBuffer(modelscopeFileUrl(source, 'version.json'), { maxBytes: 16 * 1024 }), source.label);
  let manifest;
  try {
    const manifestBuffer = await fetchRemoteBuffer(modelscopeFileUrl(source, 'update-manifest.json'), { maxBytes: 512 * 1024 });
    manifest = validateUpdateManifest(JSON.parse(manifestBuffer.toString('utf8')));
  } catch (err) {
    if (err.statusCode) throw err;
    throw updateError('魔搭更新清单不是有效 JSON', 502);
  }
  if (manifest.version !== version) throw updateError('魔搭版本文件与更新清单版本不一致', 502);
  return {
    ...source,
    ref: source.revision,
    version,
    files: manifest.files,
    notes: manifest.notes,
    publishedAt: '',
    releaseName: `${source.repository}@${source.revision}`,
    fileUrl: rel => modelscopeFileUrl(source, rel)
  };
}

async function getLatestRelease(source) {
  if (source.type === 'github-release') return getGitHubRelease(source);
  if (source.type === 'modelscope-repository') return getModelScopeRelease(source);
  throw updateError(`未知更新源：${source.key}`, 500);
}

async function checkForUpdate() {
  const currentVersion = currentAppVersion();
  const sources = await Promise.all(UPDATE_SOURCES.map(async source => {
    try {
      const release = await getLatestRelease(source);
      return {
        key: source.key,
        label: source.label,
        repository: source.repository,
        ok: true,
        version: release.version,
        updateAvailable: versionGreater(release.version, currentVersion),
        release
      };
    } catch (err) {
      return {
        key: source.key,
        label: source.label,
        repository: source.repository,
        ok: false,
        error: err.message,
        updateAvailable: false
      };
    }
  }));
  const available = sources.filter(source => source.ok && source.release);
  const latest = available.reduce((best, source) => !best || versionGreater(source.release.version, best.version) ? source.release : best, null);
  return {
    currentVersion,
    sources: sources.map(({ release, ...source }) => source),
    updateAvailable: Boolean(latest && versionGreater(latest.version, currentVersion)),
    release: latest,
    backups: listUpdateBackups()
  };
}

function backupId() {
  return `${compactTime()}_${crypto.randomBytes(3).toString('hex')}`;
}

function createUpdateBackup(files) {
  const id = backupId();
  const root = path.join(UPDATE_BACKUPS_DIR, id);
  const sourceRoot = path.join(root, 'files');
  const entries = files.map(({ path: rel }) => ({ path: rel, existed: fs.existsSync(safeUpdatePath(ROOT, rel)) }));
  entries.filter(item => item.existed).forEach(item => {
    const target = safeUpdatePath(ROOT, item.path);
    const backup = safeUpdatePath(sourceRoot, item.path);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  });
  writeJson(path.join(root, 'metadata.json'), {
    id,
    createdAt: nowIsoLocal(),
    previousVersion: currentAppVersion(),
    files: entries
  });
  return { id, root };
}

function restoreUpdateBackup(id) {
  if (!/^[0-9_]+_[a-f0-9]{6}$/.test(String(id || ''))) throw updateError('备份标识无效');
  const root = path.resolve(UPDATE_BACKUPS_DIR, id);
  if (!root.startsWith(`${path.resolve(UPDATE_BACKUPS_DIR)}${path.sep}`) || !fs.existsSync(root)) throw updateError('找不到指定备份', 404);
  const metadata = readJson(path.join(root, 'metadata.json'), null);
  if (!metadata || !Array.isArray(metadata.files)) throw updateError('备份元数据无效', 500);
  const restored = [];
  metadata.files.forEach(item => {
    const target = safeUpdatePath(ROOT, item.path);
    if (!item.existed) {
      fs.rmSync(target, { force: true });
      restored.push(item.path);
      return;
    }
    const source = safeUpdatePath(path.join(root, 'files'), item.path);
    if (!fs.existsSync(source)) throw updateError(`备份文件缺失：${item.path}`, 500);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.rollback-${process.pid}-${Date.now()}.tmp`;
    fs.copyFileSync(source, temp);
    fs.renameSync(temp, target);
    restored.push(item.path);
  });
  return { restored, previousVersion: String(metadata.previousVersion || '') };
}

function listUpdateBackups() {
  if (!fs.existsSync(UPDATE_BACKUPS_DIR)) return [];
  return fs.readdirSync(UPDATE_BACKUPS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const metadata = readJson(path.join(UPDATE_BACKUPS_DIR, entry.name, 'metadata.json'), {});
      return {
        id: entry.name,
        createdAt: String(metadata.createdAt || ''),
        previousVersion: String(metadata.previousVersion || ''),
        fileCount: Array.isArray(metadata.files) ? metadata.files.length : 0
      };
    })
    .sort((left, right) => right.id.localeCompare(left.id));
}

function scheduleSelfRestart() {
  const restartFile = path.join(UPDATE_DIR, `restart-${process.pid}-${Date.now()}.${process.platform === 'win32' ? 'bat' : 'sh'}`);
  const pid = process.pid;
  try {
    if (process.platform === 'win32') {
      const launcher = path.join(ROOT, 'win-启动服务.bat');
      const script = `@echo off\r\ntimeout /t 2 /nobreak >nul\r\ntaskkill /F /PID ${pid} >nul 2>&1\r\ntimeout /t 1 /nobreak >nul\r\nstart \"\" /D \"${ROOT}\" cmd /c call \"${launcher}\"\r\ndel \"%~f0\"\r\n`;
      fs.writeFileSync(restartFile, script, 'utf8');
      const child = spawn('cmd', ['/c', restartFile], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const launcher = path.join(ROOT, 'mac-启动服务.command');
      const logFile = path.join(CACHE_DIR, 'server.log');
      const quote = value => `'${String(value).replace(/'/g, "'\\\"'\\\"'")}'`;
      const script = `#!/bin/sh\nsleep 2\nkill -TERM ${pid} 2>/dev/null\nsleep 1\ncd ${quote(ROOT)}\nnohup /bin/sh ${quote(launcher)} > ${quote(logFile)} 2>&1 &\nrm -- \"$0\"\n`;
      fs.writeFileSync(restartFile, script, { encoding: 'utf8', mode: 0o700 });
      fs.chmodSync(restartFile, 0o700);
      const child = spawn('/bin/sh', [restartFile], { detached: true, stdio: 'ignore' });
      child.unref();
    }
    return true;
  } catch (err) {
    console.error('安排更新后重启失败：', err);
    return false;
  }
}

async function applyRemoteUpdate(sourceKey) {
  if (updateInProgress) throw updateError('正在更新中，请稍后再试', 409);
  updateInProgress = true;
  let staging = '';
  let backup;
  try {
    const source = UPDATE_SOURCES.find(item => item.key === String(sourceKey || ''));
    if (!source) throw updateError('请选择有效的更新源');
    const release = await getLatestRelease(source);
    if (!versionGreater(release.version, currentAppVersion())) throw updateError('所选更新源未提供更高版本', 409);
    staging = path.join(UPDATE_STAGING_DIR, `${compactTime()}_${crypto.randomBytes(3).toString('hex')}`);
    for (const file of release.files) {
      const target = safeUpdatePath(staging, file.path);
      const buffer = await fetchRemoteBuffer(release.fileUrl(file.path), { maxBytes: 20 * 1024 * 1024 });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer, { mode: 0o644 });
      if (sha256File(target) !== file.sha256) throw updateError(`文件校验失败：${file.path}`, 502);
    }
    backup = createUpdateBackup(release.files);
    const applied = [];
    try {
      release.files.forEach(file => {
        const source = safeUpdatePath(staging, file.path);
        const target = safeUpdatePath(ROOT, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const temp = `${target}.update-${process.pid}-${Date.now()}.tmp`;
        fs.copyFileSync(source, temp);
        fs.renameSync(temp, target);
        applied.push(file.path);
      });
    } catch (err) {
      restoreUpdateBackup(backup.id);
      throw err;
    }
    return {
      updated: applied,
      backupId: backup.id,
      version: release.version,
      releaseName: release.releaseName,
      notes: release.notes
    };
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    updateInProgress = false;
  }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function nowIsoLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function compactTime() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function slugFileName(name, fallback) {
  const clean = String(name || fallback || 'item')
    .replace(/[\\/:*?"<>|#%{}[\]`^~]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return clean || fallback || 'item';
}

function randDigits(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randHex(len) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function randStr(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomWeworkAccount() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${name}${randDigits(2)}${suffix}`;
}

function randomFriendExternalId() {
  return randStr(16) + randDigits(4) + randStr(8);
}

function randomFriendRemoteId() {
  return '788130' + randDigits(10);
}

function randomTeacherId() {
  return '168885' + randDigits(10);
}

function randomRequestId(corpId, sequence) {
  const agent = NAMES[Math.floor(Math.random() * NAMES.length)];
  return `${corpId}_${agent}_${randDigits(14)}_${Date.now()}_${sequence}`;
}

function randomNick() {
  return NICKS[Math.floor(Math.random() * NICKS.length)];
}

function normalizeLabelItems(values) {
  const items = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(value => {
    const name = String(typeof value === 'object' && value ? value.name : value || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    items.push({ name, status: value?.status === 'archived' ? 'archived' : 'active' });
  });
  return items;
}

function normalizeConfig(data) {
  const cfg = { ...DEFAULT_CONFIG, ...(data || {}) };
  cfg.businessScenarios = normalizeLabelItems(cfg.businessScenarios);
  cfg.userTags = normalizeLabelItems(cfg.userTags);
  cfg.sessionAttributeFields = (cfg.sessionAttributeFields || DEFAULT_CONFIG.sessionAttributeFields)
    .filter(field => !['agentId', 'tagList'].includes(field.key));
  return cfg;
}

function loadConfig() {
  return normalizeConfig(readJson(CONFIG_FILE, {}));
}

function casePath(caseId) {
  return path.join(CASES_DIR, `${caseId}.json`);
}

function normalizeCase(data) {
  const cfg = loadConfig();
  const now = nowIsoLocal();
  const c = data || {};
  const meta = c.meta || {};
  const message = c.message || {};
  const session = c.session || {};
  const conversation = c.conversation || {};
  const legacyMessages = Array.isArray(conversation.messages) ? conversation.messages.map(normalizeChatMessage) : [];
  const rawFlow = Array.isArray(conversation.flow) ? conversation.flow : legacyFlowFromMessages(legacyMessages, message, meta.mode, conversation.intervalSeconds);
  const flow = normalizeMessageFlow(rawFlow);
  return {
    id: c.id || id('case'),
    meta: {
      name: meta.name || c.name || '未命名用例',
      mode: flow.some(item => item.type === 'delay') ? 'multi' : 'single',
      businessScenario: meta.businessScenario ?? c.businessScenario ?? '',
      expectedResult: meta.expectedResult || c.expectedResult || '',
      createdAt: meta.createdAt || now,
      updatedAt: meta.updatedAt || now
    },
    session: {
      mode: session.mode || 'system',
      attributes: session.attributes || {},
      enabled: session.enabled === true || (session.enabled !== false && (
        Object.keys(session.attributes || {}).length > 0 ||
        ['friendNick', 'latestMsgTime', 'addTime'].some(key => Boolean(message[key])) ||
        (Boolean(message.weworkAccountAlias) && message.weworkAccountAlias !== cfg.defaultAlias)
      ))
    },
    message: {
      requestId: message.requestId || '',
      input: Array.isArray(message.input) ? message.input : (message.input ? [String(message.input)] : ['']),
      inputList: Array.isArray(message.inputList) ? message.inputList : [],
      latestMsgTime: message.latestMsgTime || '',
      weworkCorpId: message.weworkCorpId || '',
      agentId: message.agentId || cfg.defaultAgentId,
      addTime: message.addTime || '',
      weworkAccount: message.weworkAccount || '',
      friendNick: message.friendNick || '',
      friendExternalId: message.friendExternalId || '',
      tagList: Array.isArray(message.tagList) ? message.tagList : [],
      weworkAccountAlias: message.weworkAccountAlias || cfg.defaultAlias,
      friendRemoteId: message.friendRemoteId || ''
    },
    conversation: {
      flow,
      messages: legacyMessages,
      intervalSeconds: Number.isFinite(Number(conversation.intervalSeconds))
        ? Math.max(40, Number(conversation.intervalSeconds))
        : 50
    }
  };
}

function normalizeMessageFlow(flow) {
  const result = [];
  (Array.isArray(flow) ? flow : []).forEach(item => {
    if (item?.type === 'message') {
      const content = String(item.content ?? '').trim();
      if (content) result.push({
        id: item.id || id('message'),
        type: 'message',
        content,
        attributes: item.attributes && typeof item.attributes === 'object' ? item.attributes : {}
      });
      return;
    }
    if (item?.type === 'delay' && result.length && result.at(-1).type === 'message') {
      const seconds = item.seconds === null || item.seconds === undefined || item.seconds === '' ? null : Number(item.seconds);
      result.push({ id: item.id || id('delay'), type: 'delay', seconds: Number.isFinite(seconds) ? Math.max(40, seconds) : null });
    }
  });
  return result.at(-1)?.type === 'delay' ? result.slice(0, -1) : result;
}

function legacyFlowFromMessages(messages, message, mode, intervalSeconds) {
  if (mode !== 'multi') return (Array.isArray(message.input) ? message.input : []).map(content => ({ type: 'message', content }));
  if (!messages.length) {
    return (Array.isArray(message.input) ? message.input : []).flatMap((content, index) => [
      ...(index ? [{ type: 'delay', seconds: intervalSeconds ?? 50 }] : []),
      { type: 'message', content }
    ]);
  }
  const result = [];
  messages.forEach(request => {
    const inputs = (request.input || []).filter(value => String(value || '').trim());
    if (!inputs.length) return;
    if (result.length) result.push({ type: 'delay', seconds: request.delaySeconds ?? intervalSeconds ?? 50 });
    inputs.forEach(content => result.push({ type: 'message', content, attributes: request.attributes || {} }));
  });
  return result;
}

function normalizeChatMessage(m) {
  const input = Array.isArray(m.input)
    ? m.input.map(value => String(value))
    : (m.content ? [String(m.content)] : []);
  return {
    id: m.id || id('msg'),
    role: m.role === 'teacher' ? 'teacher' : 'student',
    input,
    delaySeconds: Number.isFinite(Number(m.delaySeconds)) ? Math.max(40, Number(m.delaySeconds)) : 50,
    attributes: m.attributes && typeof m.attributes === 'object' ? m.attributes : {}
  };
}

function createEmptyCase(name) {
  return normalizeCase({
    meta: { name: name || '新测试用例', mode: 'single' },
    message: { input: [''], tagList: [] },
    session: { mode: 'system', attributes: {} }
  });
}

function saveCase(data) {
  const c = normalizeCase({
    ...data,
    meta: {
      ...(data.meta || {}),
      updatedAt: nowIsoLocal()
    }
  });
  writeJson(casePath(c.id), c);
  return c;
}

function listCases() {
  return fs.readdirSync(CASES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readJson(path.join(CASES_DIR, f), null))
    .filter(Boolean)
    .map(normalizeCase)
    .sort((a, b) => String(b.meta.updatedAt).localeCompare(String(a.meta.updatedAt)));
}

function loadCase(caseId) {
  const file = casePath(caseId);
  if (!fs.existsSync(file)) return null;
  return normalizeCase(readJson(file, null));
}

function deleteCase(caseId) {
  const file = casePath(caseId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function labelUsage(type, name) {
  return listCases().filter(c => type === 'userTags'
    ? (c.message.tagList || []).includes(name)
    : c.meta.businessScenario === name);
}

function labelManagementData() {
  const cfg = loadConfig();
  return ['userTags', 'businessScenarios'].reduce((result, type) => {
    result[type] = cfg[type].map(item => ({ ...item, usageCount: labelUsage(type, item.name).length }));
    return result;
  }, {});
}

function updateLabelManagement(body) {
  const type = body.type === 'businessScenarios' ? 'businessScenarios' : body.type === 'userTags' ? 'userTags' : '';
  const action = String(body.action || '');
  const name = String(body.name || '').trim();
  const replacement = String(body.replacement || '').trim();
  if (!type || !action || !name) {
    const err = new Error('标签或业务场景参数不完整');
    err.statusCode = 400;
    throw err;
  }
  const cfg = loadConfig();
  const item = cfg[type].find(value => value.name === name);
  const usageCases = labelUsage(type, name);
  if (action === 'create') {
    if (item) {
      const err = new Error('同类型名称已存在');
      err.statusCode = 400;
      throw err;
    }
    cfg[type].push({ name, status: 'active' });
  } else {
    if (!item) {
      const err = new Error('标签或业务场景不存在');
      err.statusCode = 404;
      throw err;
    }
    if (action === 'archive') item.status = 'archived';
    else if (action === 'restore') item.status = 'active';
    else if (action === 'delete') {
      if (usageCases.length) {
        const err = new Error(`该项正在被 ${usageCases.length} 个测试用例使用，请选择归档、替换或移除`);
        err.statusCode = 400;
        throw err;
      }
      cfg[type] = cfg[type].filter(value => value.name !== name);
    } else if (action === 'replace') {
      const target = cfg[type].find(value => value.name === replacement && value.status === 'active');
      if (!target || target.name === name) {
        const err = new Error('请选择其他启用项进行替换');
        err.statusCode = 400;
        throw err;
      }
      usageCases.forEach(c => {
        if (type === 'userTags') c.message.tagList = [...new Set((c.message.tagList || []).map(tag => tag === name ? target.name : tag))];
        else c.meta.businessScenario = target.name;
        saveCase(c);
      });
      cfg[type] = cfg[type].filter(value => value.name !== name);
    } else if (action === 'remove' && type === 'userTags') {
      usageCases.forEach(c => {
        c.message.tagList = (c.message.tagList || []).filter(tag => tag !== name);
        saveCase(c);
      });
      cfg[type] = cfg[type].filter(value => value.name !== name);
    } else if (action === 'clear' && type === 'businessScenarios') {
      usageCases.forEach(c => {
        c.meta.businessScenario = '';
        saveCase(c);
      });
      cfg[type] = cfg[type].filter(value => value.name !== name);
    } else {
      const err = new Error('不支持的维护操作');
      err.statusCode = 400;
      throw err;
    }
  }
  const nextConfig = normalizeConfig(cfg);
  writeJson(CONFIG_FILE, nextConfig);
  return { config: nextConfig, management: labelManagementData() };
}

function deleteLabelManagementItems(body) {
  const type = body.type === 'businessScenarios' ? 'businessScenarios' : body.type === 'userTags' ? 'userTags' : '';
  const names = [...new Set((Array.isArray(body.names) ? body.names : []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!type || !names.length) {
    const err = new Error('批量删除参数不完整');
    err.statusCode = 400;
    throw err;
  }
  const cfg = loadConfig();
  const missingNames = names.filter(name => !cfg[type].some(item => item.name === name));
  if (missingNames.length) {
    const err = new Error('部分标签或业务场景不存在，请刷新后重试');
    err.statusCode = 404;
    throw err;
  }
  const inUseItems = names.map(name => ({ name, count: labelUsage(type, name).length })).filter(item => item.count > 0);
  if (inUseItems.length) {
    const preview = inUseItems.slice(0, 3).map(item => `“${item.name}”`).join('、');
    const suffix = inUseItems.length > 3 ? '等' : '';
    const err = new Error(`${preview}${suffix}仍被测试用例使用，无法批量删除`);
    err.statusCode = 400;
    throw err;
  }
  cfg[type] = cfg[type].filter(item => !names.includes(item.name));
  const nextConfig = normalizeConfig(cfg);
  writeJson(CONFIG_FILE, nextConfig);
  return { config: nextConfig, management: labelManagementData() };
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[,，;\n]/).map(s => s.trim()).filter(Boolean);
}

function formatDateForInput(value) {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 19);
}

function addSecondsToProtocolTime(value, seconds) {
  const formatted = formatDateForInput(value);
  const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
    : new Date();
  date.setSeconds(date.getSeconds() + Math.max(0, Number(seconds) || 0));
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function applyAttributes(payload, attrs) {
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (!key || value === undefined || value === null || value === '') return;
    if (key === 'tagList') payload.tagList = parseTags(value);
    else if (key === 'addTime' || key === 'latestMsgTime') payload[key] = formatDateForInput(value);
    else payload[key] = value;
  });
}

function basePayload(c, session, agentId) {
  const cfg = loadConfig();
  const msg = c.message || {};
  const now = nowIsoLocal();
  return {
    requestId: '',
    input: [],
    latestMsgTime: msg.latestMsgTime || now,
    weworkCorpId: session.weworkCorpId,
    agentId: agentId || msg.agentId || cfg.defaultAgentId,
    addTime: msg.addTime || now,
    weworkAccount: session.weworkAccount,
    friendNick: msg.friendNick || randomNick(),
    friendExternalId: session.friendExternalId,
    tagList: Array.isArray(msg.tagList) ? [...msg.tagList] : [],
    inputList: [],
    weworkAccountAlias: msg.weworkAccountAlias || cfg.defaultAlias,
    friendRemoteId: session.friendRemoteId
  };
}

function createSession() {
  const weworkCorpId = 'ww' + randHex(8);
  const weworkAccount = randomWeworkAccount();
  const friendExternalId = randomFriendExternalId();
  const friendNick = randomNick();
  return {
    weworkCorpId,
    weworkAccount,
    friendExternalId,
    friendNick,
    friendRemoteId: randomFriendRemoteId(),
    teacherId: randomTeacherId(),
    weworkAccountAliasesByCorp: new Map(),
    friendNicksByExternalId: new Map()
  };
}

function applyIdentityLinks(payload, session) {
  payload.weworkCorpId = session.weworkCorpId;
  payload.weworkAccount = session.weworkAccount;
  payload.friendExternalId = session.friendExternalId;
  payload.friendRemoteId = session.friendRemoteId;
  if (!session.weworkAccountAliasesByCorp.has(session.weworkCorpId)) {
    session.weworkAccountAliasesByCorp.set(session.weworkCorpId, payload.weworkAccountAlias || loadConfig().defaultAlias);
  }
  payload.weworkAccountAlias = session.weworkAccountAliasesByCorp.get(session.weworkCorpId);
  if (!session.friendNicksByExternalId.has(session.friendExternalId)) {
    session.friendNicksByExternalId.set(session.friendExternalId, payload.friendNick || session.friendNick);
  }
  payload.friendNick = session.friendNicksByExternalId.get(session.friendExternalId);
}

function buildSnapshots(c, options) {
  const agentId = String(options?.agentId || '').trim();
  const session = createSession();
  const snapshots = [];
  const sessionMode = c.session.mode || 'system';
  const unifiedAttrs = sessionMode === 'custom' || sessionMode === 'unified' ? c.session.attributes : {};
  const history = Array.isArray(c.message.inputList) ? [...c.message.inputList] : [];
  const groups = messageFlowGroups(c.conversation.flow);
  let latestMsgTime = '';
  groups.forEach(group => {
    const payload = basePayload(c, session, agentId);
    payload.input = group.messages.map(item => item.content);
    payload.inputList = [...history];
    if (sessionMode === 'perMessage') applyAttributes(payload, group.messages[0]?.attributes);
    else applyAttributes(payload, unifiedAttrs);
    if (agentId) payload.agentId = agentId;
    applyIdentityLinks(payload, session);
    const delaySeconds = snapshots.length === 0 ? 0 : group.delaySeconds;
    latestMsgTime = snapshots.length === 0
      ? payload.latestMsgTime
      : addSecondsToProtocolTime(latestMsgTime || payload.latestMsgTime, delaySeconds);
    payload.latestMsgTime = latestMsgTime;
    payload.requestId = randomRequestId(session.weworkCorpId, snapshots.length + 1);
    snapshots.push({
      index: snapshots.length + 1,
      role: 'student',
      content: payload.input[0] || '',
      delaySeconds,
      payload
    });
    group.messages.forEach(item => history.push(`${session.friendRemoteId}:${item.content}`));
  });

  if (snapshots.length === 0) {
    const payload = basePayload(c, session, agentId);
    payload.input = Array.isArray(c.message.input) && c.message.input.length ? [...c.message.input] : [''];
    payload.inputList = Array.isArray(c.message.inputList) ? [...c.message.inputList] : [];
    applyAttributes(payload, unifiedAttrs);
    if (agentId) payload.agentId = agentId;
    applyIdentityLinks(payload, session);
    payload.requestId = randomRequestId(session.weworkCorpId, 1);
    snapshots.push({ index: 1, role: 'student', content: payload.input[0] || '', delaySeconds: 0, payload });
  }
  return snapshots;
}

function messageFlowGroups(flow) {
  const groups = [];
  let messages = [];
  let delaySeconds = 0;
  normalizeMessageFlow(flow).forEach(item => {
    if (item.type === 'message') messages.push(item);
    else if (messages.length) {
      groups.push({ messages, delaySeconds });
      messages = [];
      delaySeconds = item.seconds;
    }
  });
  if (messages.length) groups.push({ messages, delaySeconds });
  return groups;
}

function environmentMqConfig() {
  const missing = MQ_REQUIRED_ENV.filter(key => !String(process.env[key] || '').trim());
  if (missing.length) {
    const err = new Error('MQ 发送配置不完整');
    err.statusCode = 400;
    throw err;
  }
  return {
    gatewayUrl: String(process.env.MQ_GATEWAY_URL).replace(/\/+$/, ''),
    appId: process.env.MQ_APP_ID,
    topic: process.env.MQ_TOPIC,
    producerGroup: process.env.MQ_PRODUCER_GROUP,
    secretKey: process.env.MQ_SECRET_KEY,
    nameServer: process.env.MQ_NAME_SERVER,
    messageType: process.env.MQ_MESSAGE_TYPE
  };
}

function mqConfigRecord(value, existing = {}) {
  const config = {
    id: existing.id || value.id || id('mq'),
    name: String(value.name || existing.name || '').trim(),
    gatewayUrl: String(value.gatewayUrl || existing.gatewayUrl || '').trim().replace(/\/+$/, ''),
    appId: String(value.appId || existing.appId || '').trim(),
    topic: String(value.topic || existing.topic || '').trim(),
    producerGroup: String(value.producerGroup || existing.producerGroup || '').trim(),
    secretKey: String(value.secretKey || existing.secretKey || '').trim(),
    nameServer: String(value.nameServer || existing.nameServer || '').trim(),
    messageType: String(value.messageType || existing.messageType || '').trim()
  };
  if (Object.entries(config).some(([key, value]) => key !== 'id' && !value)) {
    const err = new Error('MQ 配置填写不完整');
    err.statusCode = 400;
    throw err;
  }
  return config;
}

function readMqConfigs() {
  const data = readJson(MQ_CONFIGS_FILE, { configs: [] });
  return Array.isArray(data?.configs) ? data.configs : [];
}

function publicMqConfig(config) {
  return {
    id: config.id,
    name: config.name,
    gatewayUrl: config.gatewayUrl,
    appId: config.appId,
    topic: config.topic,
    producerGroup: config.producerGroup,
    nameServer: config.nameServer,
    messageType: config.messageType,
    hasSecretKey: Boolean(config.secretKey)
  };
}

function saveMqConfig(value) {
  const configs = readMqConfigs();
  const existingIndex = value.id ? configs.findIndex(config => config.id === value.id) : -1;
  const config = mqConfigRecord(value, existingIndex >= 0 ? configs[existingIndex] : {});
  if (configs.some(item => item.id !== config.id && item.name === config.name)) {
    const err = new Error('MQ 配置名称已存在');
    err.statusCode = 400;
    throw err;
  }
  if (existingIndex >= 0) configs[existingIndex] = config;
  else configs.push(config);
  writePrivateJson(MQ_CONFIGS_FILE, { configs });
  return publicMqConfig(config);
}

function mqConfig(configId) {
  const configs = readMqConfigs();
  const selected = configId ? configs.find(config => config.id === configId) : configs[0];
  if (selected) return selected;
  return environmentMqConfig();
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function mqGatewayJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let data;
    try {
      data = await response.json();
    } catch (err) {
      return { ok: false, error: 'MQ 网关响应格式错误' };
    }
    if (!response.ok) return { ok: false, error: `MQ 网关返回 HTTP ${response.status}` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'MQ 网关请求超时' : 'MQ 网关网络错误' };
  } finally {
    clearTimeout(timeout);
  }
}

function producerEntries(status) {
  const candidates = [
    Array.isArray(status) ? status : null,
    status?.producers,
    status?.producerList,
    status?.data?.producers,
    status?.data?.producerList
  ];
  return candidates.find(Array.isArray) || [];
}

function hasExpectedProducer(status, config) {
  const expected = `${config.nameServer}_${config.producerGroup}`;
  return producerEntries(status).some(item => {
    if (typeof item === 'string') return item === expected;
    if (!item || typeof item !== 'object') return false;
    if ([item.name, item.id, item.key, item.producerName].includes(expected)) return true;
    return `${item.nameServer || ''}_${item.producerGroup || item.group || ''}` === expected;
  });
}

async function checkMqGatewayReady(config) {
  const result = await mqGatewayJson(`${config.gatewayUrl}/api/mq/status`, { method: 'GET' });
  if (!result.ok) return { ready: false, error: result.error };
  if (result.data?.success === false) return { ready: false, error: result.data.error || result.data.message || 'MQ 网关未就绪' };
  if (!hasExpectedProducer(result.data, config)) return { ready: false, error: 'MQ Producer 未启动或未就绪' };
  return { ready: true, error: '' };
}

function failedMqResult(error) {
  return {
    success: false,
    msgId: '',
    offsetMsgId: '',
    sendStatus: '',
    error,
    sentAt: nowIsoLocal()
  };
}

async function sendSnapshotToMq(snapshot, config) {
  const result = await mqGatewayJson(`${config.gatewayUrl}/api/mq/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        appId: config.appId,
        topic: config.topic,
        producerGroup: config.producerGroup,
        secretKey: config.secretKey,
        nameServer: config.nameServer,
        messageType: config.messageType
      },
      messageBody: JSON.stringify(snapshot.payload),
      tag: '',
      keys: snapshot.payload.requestId
    })
  });
  if (!result.ok) return failedMqResult(result.error);
  if (result.data?.success !== true) return failedMqResult(result.data?.error || result.data?.message || 'MQ 网关发送失败');
  return {
    success: true,
    msgId: result.data.msgId || '',
    offsetMsgId: result.data.offsetMsgId || '',
    sendStatus: result.data.sendStatus || '',
    error: '',
    sentAt: nowIsoLocal()
  };
}

async function sendSnapshotsInOrder(snapshots, config) {
  const sentSnapshots = [];
  for (const snapshot of snapshots) {
    if (snapshot.delaySeconds > 0) await wait(snapshot.delaySeconds * 1000);
    sentSnapshots.push({ ...snapshot, mqResult: await sendSnapshotToMq(snapshot, config) });
  }
  return sentSnapshots;
}

function summarizeMqSend(snapshots, gatewayReady = true) {
  const successCount = snapshots.filter(snapshot => snapshot.mqResult?.success).length;
  const failCount = snapshots.length - successCount;
  return {
    status: gatewayReady ? (failCount === 0 ? '发送成功' : successCount === 0 ? '发送失败' : '部分失败') : '网关未就绪',
    successCount,
    failCount
  };
}

async function sendCaseToMq(c, options = {}, config = mqConfig()) {
  const snapshots = buildSnapshots(c, options);
  const gateway = await checkMqGatewayReady(config);
  const sentSnapshots = gateway.ready
    ? await sendSnapshotsInOrder(snapshots, config)
    : snapshots.map(snapshot => ({ ...snapshot, mqResult: failedMqResult(gateway.error) }));
  const summary = summarizeMqSend(sentSnapshots, gateway.ready);
  const record = saveRecord(c, sentSnapshots, { ...options, ...summary });
  return { record, ...summary };
}

function appendSnapshotFromRecord(record, message) {
  const snapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  const previousPayload = snapshots[snapshots.length - 1]?.payload;
  if (!previousPayload || typeof previousPayload !== 'object') {
    const err = new Error('测试记录中没有可追加的发送 JSON');
    err.statusCode = 400;
    throw err;
  }
  const payload = JSON.parse(JSON.stringify(previousPayload));
  const previousInput = Array.isArray(previousPayload.input) ? previousPayload.input : [];
  const history = Array.isArray(previousPayload.inputList) ? [...previousPayload.inputList] : [];
  const friendRemoteId = String(previousPayload.friendRemoteId || 'friendRemoteId');
  previousInput.forEach(value => history.push(`${friendRemoteId}:${String(value || '')}`));
  payload.input = [message];
  payload.inputList = history;
  payload.latestMsgTime = addSecondsToProtocolTime(previousPayload.latestMsgTime, 20);
  payload.requestId = randomRequestId(String(payload.weworkCorpId || 'ww'), snapshots.length + 1);
  return {
    index: snapshots.length + 1,
    role: 'student',
    content: message,
    delaySeconds: 0,
    payload
  };
}

async function appendMessageToRecord(record, message, config = mqConfig(record.mqConfigId)) {
  const snapshot = appendSnapshotFromRecord(record, message);
  const gateway = await checkMqGatewayReady(config);
  const sentSnapshot = gateway.ready
    ? { ...snapshot, mqResult: await sendSnapshotToMq(snapshot, config) }
    : { ...snapshot, mqResult: failedMqResult(gateway.error) };
  const appendResult = summarizeMqSend([sentSnapshot], gateway.ready);
  const existingSnapshots = Array.isArray(record.snapshots) ? record.snapshots : [];
  const knownSnapshots = existingSnapshots.filter(item => typeof item?.mqResult?.success === 'boolean');
  const previousSuccessCount = knownSnapshots.length
    ? knownSnapshots.filter(item => item.mqResult.success).length
    : Number(record.successCount || 0);
  const previousFailCount = knownSnapshots.length
    ? knownSnapshots.filter(item => !item.mqResult.success).length
    : Number(record.failCount || 0);
  record.snapshots = [...existingSnapshots, sentSnapshot];
  record.mqMessageCount = Number(record.mqMessageCount ?? existingSnapshots.length) + 1;
  record.userMessageCount = Number(record.userMessageCount ?? 0) + 1;
  record.triggerMessages = [...(Array.isArray(record.triggerMessages) ? record.triggerMessages : []), message];
  record.successCount = previousSuccessCount + appendResult.successCount;
  record.failCount = previousFailCount + appendResult.failCount;
  record.status = gateway.ready
    ? (record.failCount === 0 ? '发送成功' : record.successCount === 0 ? '发送失败' : '部分失败')
    : '网关未就绪';
  return { record, appendResult };
}

function saveRecord(c, snapshots, options) {
  const executedAt = nowIsoLocal();
  const date = executedAt.slice(0, 10).replace(/-/g, '');
  const recordId = id('record');
  const mqMessageCount = snapshots.length;
  const userMessageCount = snapshots.reduce((count, snapshot) => count + (Array.isArray(snapshot.payload?.input) ? snapshot.payload.input.length : 0), 0);
  const triggerMessages = snapshots.flatMap(snapshot => Array.isArray(snapshot.payload?.input) ? snapshot.payload.input : []);
  const firstPayload = snapshots[0]?.payload || {};
  const conversationId = firstPayload.weworkAccount && firstPayload.friendExternalId
    ? `${firstPayload.weworkAccount}_${firstPayload.friendExternalId}`
    : '';
  const record = {
    id: recordId,
    caseId: c.id,
    caseName: c.meta.name,
    mode: c.meta.mode,
    expectedResult: c.meta.expectedResult || '',
    executedAt,
    agentId: (options && options.agentId) || c.message.agentId || loadConfig().defaultAgentId,
    mqConfigId: options?.mqConfigId || '',
    status: options?.status || '待发送',
    successCount: options?.successCount ?? 0,
    failCount: options?.failCount ?? 0,
    firstRequestId: snapshots[0] && snapshots[0].payload.requestId,
    conversationId,
    mqMessageCount,
    userMessageCount,
    triggerMessages,
    snapshots,
    caseSnapshot: c
  };
  const dir = path.join(RECORDS_DIR, date);
  const fileName = `${compactTime()}_${slugFileName(c.meta.name, c.id)}_${recordId}.json`;
  writeJson(path.join(dir, fileName), record);
  return { ...record, date, fileName };
}

function listRecords() {
  if (!fs.existsSync(RECORDS_DIR)) return [];
  const dates = fs.readdirSync(RECORDS_DIR).filter(d => fs.statSync(path.join(RECORDS_DIR, d)).isDirectory());
  const records = [];
  dates.forEach(date => {
    fs.readdirSync(path.join(RECORDS_DIR, date))
      .filter(f => f.endsWith('.json'))
      .forEach(fileName => {
        const file = path.join(RECORDS_DIR, date, fileName);
        const r = readJson(file, null);
        if (!r) return;
        const snapshots = Array.isArray(r.snapshots) ? r.snapshots : [];
        const triggerMessages = Array.isArray(r.triggerMessages)
          ? r.triggerMessages
          : snapshots.flatMap(snapshot => Array.isArray(snapshot.payload?.input) ? snapshot.payload.input : []);
        const firstPayload = snapshots[0]?.payload || {};
        const conversationId = r.conversationId || (firstPayload.weworkAccount && firstPayload.friendExternalId
          ? `${firstPayload.weworkAccount}_${firstPayload.friendExternalId}`
          : '');
        records.push({
          id: r.id,
          date,
          fileName,
          caseName: r.caseName,
          note: r.expectedResult || r.caseSnapshot?.meta?.expectedResult || '',
          executedAt: r.executedAt,
          agentId: r.agentId,
          conversationId,
          weworkCorpId: firstPayload.weworkCorpId || '',
          friendNick: firstPayload.friendNick || '',
          triggerMessages,
          status: r.status,
          mqMessageCount: r.mqMessageCount ?? r.requestCount ?? snapshots.length,
          userMessageCount: r.userMessageCount ?? r.messageCount ?? snapshots.reduce((count, snapshot) => count + (Array.isArray(snapshot.payload?.input) ? snapshot.payload.input.length : 0), 0)
        });
      });
  });
  return records.sort((a, b) => String(b.executedAt).localeCompare(String(a.executedAt)));
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text || '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index++;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"' && !value) quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\r') continue;
    else if (char === '\n') {
      row.push(value);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  row.push(value);
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function parseCsvInputList(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
  } catch (err) {
    // Plain-text history is handled as one message per line.
  }
  return source.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function parseCsvTagList(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parseTags(parsed);
  } catch (err) {
    // Fall through to delimiter parsing.
  }
  return parseTags(source);
}

function casesFromCsvText(text) {
  const [headers = [], ...rows] = parseCsvRows(text);
  const keys = headers.map(value => String(value || '').trim().replace(/^\uFEFF/, ''));
  if (!keys.includes('input')) throw new Error('CSV 缺少 input 列');
  const columnIndexes = Object.fromEntries(keys.map((key, index) => [key, index]));
  const cases = rows.map(values => Object.fromEntries(Object.entries(CSV_CASE_FIELD_SOURCES).map(([field, sources]) => {
    const source = sources.find(key => columnIndexes[key] !== undefined);
    return [field, source === undefined ? '' : String(values[columnIndexes[source]] || '').trim()];
  })))
    .filter(row => row.input)
    .map((row, index) => {
      const businessScenario = row.modelName || '';
      const importedName = [row.id, row.request_time].filter(Boolean).join('-');
      const c = createEmptyCase(importedName || (businessScenario ? `${businessScenario}-第${index + 1}条` : `CSV导入-第${index + 1}条`));
      c.meta.businessScenario = businessScenario;
      c.meta.expectedResult = row.skip_reason || '';
      c.message.input = [row.input];
      c.message.inputList = parseCsvInputList(row.inputList);
      c.message.tagList = parseCsvTagList(row.tagList);
      c.conversation.flow = [{ type: 'message', content: row.input, attributes: {} }];
      return c;
    });
  if (!cases.length) throw new Error('CSV 未找到有效 input 数据');
  return cases;
}

function parseCsvCases(text) {
  return casesFromCsvText(text).map(saveCase);
}

function copyCaseForImport(value) {
  const c = JSON.parse(JSON.stringify(value));
  delete c.id;
  if (c.meta) {
    delete c.meta.createdAt;
    delete c.meta.updatedAt;
  }
  return c;
}

function stripImportedIdentityFields(c) {
  const clearFields = value => {
    if (!value || typeof value !== 'object') return;
    IMPORT_IGNORED_ID_FIELDS.forEach(key => delete value[key]);
  };
  clearFields(c.message);
  clearFields(c.session?.attributes);
  (c.conversation?.flow || []).forEach(item => clearFields(item?.attributes));
  (c.conversation?.messages || []).forEach(item => clearFields(item?.attributes));
  return c;
}

function caseFromExportedJson(item, fallbackName) {
  if (item?.caseData && typeof item.caseData === 'object') return stripImportedIdentityFields(copyCaseForImport(item.caseData));
  if (item?.meta || item?.message || item?.conversation) return stripImportedIdentityFields(copyCaseForImport(item));
  const rawMessages = Array.isArray(item?.jsonMessages) ? item.jsonMessages : [];
  const payloads = rawMessages.map((raw, index) => {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`第 ${index + 1} 条 JSON 消息格式不正确`);
    const input = Array.isArray(payload.input) ? payload.input : [];
    if (!input.length || input.some(value => !String(value || '').trim())) throw new Error(`第 ${index + 1} 条 JSON 消息缺少 input`);
    return { payload, input };
  });
  if (!payloads.length) throw new Error('未找到 jsonMessages');
  const first = payloads[0].payload;
  const message = {};
  PROTOCOL_MESSAGE_FIELDS.forEach(key => {
    if (key === 'input') message.input = [...payloads[0].input];
    else if (key === 'inputList' || key === 'tagList') message[key] = Array.isArray(first[key]) ? [...first[key]] : [];
    else message[key] = first[key] ?? '';
  });
  const flow = [];
  payloads.forEach(({ payload, input }, index) => {
    if (index) flow.push({ type: 'delay', seconds: 50 });
    const attributes = {};
    PROTOCOL_MESSAGE_FIELDS.forEach(key => {
      if (key === 'input') return;
      attributes[key] = Array.isArray(payload[key]) ? [...payload[key]] : payload[key] ?? '';
    });
    input.forEach(content => flow.push({ type: 'message', content, attributes }));
  });
  return stripImportedIdentityFields({
    meta: {
      name: item?.caseName || fallbackName || '未命名用例',
      businessScenario: item?.businessScenario || '',
      expectedResult: item?.expectedResult || ''
    },
    message,
    session: { mode: 'perMessage', attributes: {}, enabled: true },
    conversation: { flow, messages: [], intervalSeconds: 50 }
  });
}

function parseJsonCases(data, fileName, businessScenario = '', overrideBusinessScenario = false) {
  const items = Array.isArray(data) ? data : (Array.isArray(data?.cases) ? data.cases : [data]);
  if (!items.length) throw new Error('测试用例文件为空');
  return items.map(item => {
    const c = caseFromExportedJson(item, fileName);
    if (overrideBusinessScenario) c.meta = { ...c.meta, businessScenario };
    return saveCase(c);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR)) return notFound(res);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return notFound(res);
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, pathname, url) {
  try {
    if (req.method === 'GET' && pathname === '/api/config') {
      return json(res, 200, loadConfig());
    }
    if (req.method === 'PUT' && pathname === '/api/config') {
      const body = await parseBody(req);
      const cfg = normalizeConfig({ ...loadConfig(), ...body });
      writeJson(CONFIG_FILE, cfg);
      return json(res, 200, cfg);
    }
    if (req.method === 'GET' && pathname === '/api/update/status') {
      return json(res, 200, {
        currentVersion: currentAppVersion(),
        sources: UPDATE_SOURCES.map(({ key, label, repository }) => ({ key, label, repository })),
        backups: listUpdateBackups()
      });
    }
    if (req.method === 'POST' && pathname === '/api/update/check') {
      return json(res, 200, await checkForUpdate());
    }
    if (req.method === 'POST' && pathname === '/api/update/apply') {
      const body = await parseBody(req);
      const result = await applyRemoteUpdate(body.sourceKey);
      const restartScheduled = body.restart !== false ? scheduleSelfRestart() : false;
      return json(res, 200, { ok: true, ...result, restartScheduled });
    }
    if (req.method === 'POST' && pathname === '/api/update/rollback') {
      const body = await parseBody(req);
      if (updateInProgress) throw updateError('正在更新中，请稍后再试', 409);
      updateInProgress = true;
      try {
        const result = restoreUpdateBackup(body.backupId);
        const restartScheduled = body.restart !== false ? scheduleSelfRestart() : false;
        return json(res, 200, { ok: true, ...result, restartScheduled });
      } finally {
        updateInProgress = false;
      }
    }
    if (req.method === 'GET' && pathname === '/api/label-management') {
      return json(res, 200, labelManagementData());
    }
    if (req.method === 'POST' && pathname === '/api/label-management') {
      return json(res, 200, updateLabelManagement(await parseBody(req)));
    }
    if (req.method === 'POST' && pathname === '/api/label-management/batch-delete') {
      return json(res, 200, deleteLabelManagementItems(await parseBody(req)));
    }
    if (req.method === 'GET' && pathname === '/api/meta') {
      return json(res, 200, {
        sessionAttributeFields: loadConfig().sessionAttributeFields
      });
    }
    if (req.method === 'GET' && pathname === '/api/mq-configs') {
      return json(res, 200, readMqConfigs().map(publicMqConfig));
    }
    if (req.method === 'POST' && pathname === '/api/mq-configs') {
      return json(res, 201, saveMqConfig(await parseBody(req)));
    }
    const mqConfigMatch = pathname.match(/^\/api\/mq-configs\/([^/]+)$/);
    if (req.method === 'PUT' && mqConfigMatch) {
      const body = await parseBody(req);
      body.id = decodeURIComponent(mqConfigMatch[1]);
      return json(res, 200, saveMqConfig(body));
    }
    if (req.method === 'GET' && pathname === '/api/cases') {
      return json(res, 200, listCases());
    }
    if (req.method === 'POST' && pathname === '/api/cases') {
      const body = await parseBody(req);
      const c = saveCase((body.meta || body.message || body.conversation) ? body : createEmptyCase(body.name));
      return json(res, 201, c);
    }
    if (req.method === 'POST' && pathname === '/api/cases/import-csv') {
      const body = await parseBody(req);
      const imported = parseCsvCases(body.text || '');
      return json(res, 201, { count: imported.length, cases: imported });
    }
    if (req.method === 'POST' && pathname === '/api/cases/import-json') {
      const body = await parseBody(req);
      const imported = parseJsonCases(body.data, body.fileName, String(body.businessScenario || '').trim(), body.scenarioSource === 'uniform');
      return json(res, 201, { count: imported.length, cases: imported });
    }
    const caseMatch = pathname.match(/^\/api\/cases\/([^/]+)(?:\/([^/]+))?$/);
    if (caseMatch) {
      const caseId = decodeURIComponent(caseMatch[1]);
      const action = caseMatch[2];
      const c = loadCase(caseId);
      if (!c) return notFound(res);
      if (req.method === 'GET' && !action) return json(res, 200, c);
      if (req.method === 'PUT' && !action) {
        const body = await parseBody(req);
        body.id = caseId;
        return json(res, 200, saveCase(body));
      }
      if (req.method === 'DELETE' && !action) {
        deleteCase(caseId);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && action === 'duplicate') {
        const copy = normalizeCase(c);
        copy.id = id('case');
        copy.meta.name = `${copy.meta.name}-副本`;
        copy.meta.createdAt = nowIsoLocal();
        copy.meta.updatedAt = copy.meta.createdAt;
        return json(res, 201, saveCase(copy));
      }
      if (req.method === 'POST' && action === 'send') {
        const body = await parseBody(req);
        const result = await sendCaseToMq(c, { agentId: body.agentId, mqConfigId: body.mqConfigId }, mqConfig(body.mqConfigId));
        return json(res, 201, result.record);
      }
    }
    if (req.method === 'POST' && pathname === '/api/send-batch') {
      const body = await parseBody(req);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const config = mqConfig(body.mqConfigId);
      const records = [];
      for (const caseId of ids) {
        const c = loadCase(caseId);
        if (!c) continue;
        const result = await sendCaseToMq(c, { agentId: body.agentId, mqConfigId: body.mqConfigId }, config);
        records.push(result.record);
      }
      const successCount = records.reduce((count, record) => count + (record.successCount || 0), 0);
      const failCount = records.reduce((count, record) => count + (record.failCount || 0), 0);
      return json(res, 201, { count: records.length, records, successCount, failCount });
    }
    if (req.method === 'GET' && pathname === '/api/records') {
      return json(res, 200, listRecords());
    }
    if (req.method === 'GET' && pathname === '/api/records/detail') {
      const date = String(url.searchParams.get('date') || '').replace(/[^0-9]/g, '');
      const fileName = path.basename(url.searchParams.get('file') || '');
      if (!date || !fileName) return badRequest(res, 'Missing date or file');
      const file = path.join(RECORDS_DIR, date, fileName);
      if (!fs.existsSync(file)) return notFound(res);
      return json(res, 200, readJson(file, {}));
    }
    if (req.method === 'POST' && pathname === '/api/records/append-message') {
      const body = await parseBody(req);
      const date = String(body.date || '').replace(/[^0-9]/g, '');
      const fileName = path.basename(body.fileName || '');
      const message = String(body.message || '').trim();
      if (!date || !fileName || !message) return badRequest(res, '缺少测试记录或追加消息');
      const file = path.join(RECORDS_DIR, date, fileName);
      if (!fs.existsSync(file)) return notFound(res);
      const record = readJson(file, null);
      if (!record) return notFound(res);
      const result = await appendMessageToRecord(record, message, mqConfig(record.mqConfigId));
      writeJson(file, result.record);
      return json(res, 201, { date, fileName, appendResult: result.appendResult });
    }
    return notFound(res);
  } catch (err) {
    return json(res, err.statusCode || 500, { error: err.message });
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, url);
    return serveStatic(req, res, pathname);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port) {
  const server = createServer();
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') return listen(port + 1);
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    const url = `http://localhost:${server.address().port}`;
    console.log('');
    console.log('AI 工作流消息测试平台 V1 已启动');
    console.log(url);
    console.log('按 Ctrl+C 停止服务');
    console.log('');
    if (!process.argv.includes('--no-open')) openBrowser(url);
  });
}

if (require.main === module) {
  ensureDirs();
  listen(Number(process.env.PORT || loadConfig().preferredPort || 32880));
}

module.exports = {
  buildSnapshots,
  casesFromCsvText,
  checkMqGatewayReady,
  currentAppVersion,
  isUpdateAllowedPath,
  sendSnapshotToMq,
  sendSnapshotsInOrder,
  summarizeMqSend,
  validateUpdateManifest,
  versionGreater
};
