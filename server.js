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
const DB_CONFIGS_FILE = path.join(CACHE_DIR, 'db-configs.json');
const DB_CONVERSATION_FILTERS_FILE = path.join(CACHE_DIR, 'db-conversation-filters.json');
const UPDATE_DIR = path.join(CACHE_DIR, 'updates');
const UPDATE_BACKUPS_DIR = path.join(UPDATE_DIR, 'backups');
const UPDATE_STAGING_DIR = path.join(UPDATE_DIR, 'staging');
const VERSION_FILE = path.join(ROOT, 'version.json');
const UPDATE_SOURCES = [
  {
    key: 'github',
    label: 'GitHub',
    repository: 'LeonRiki/lingshu_mq_sender',
    contentRoot: '',
    revision: 'main',
    type: 'github-repository'
  },
  {
    key: 'modelscope',
    label: '魔搭',
    repository: 'LeonRiki/lingshu_mq',
    contentRoot: 'v1',
    revision: 'master',
    type: 'modelscope-repository'
  }
];
const UPDATE_ROOT_FILES = new Set([
  'mac-启动服务.command',
  'server.js',
  'version.json',
  'win-启动服务.bat'
]);
const UPDATE_WEB_FILES = new Set([
  'web/app.js',
  'web/case-list-filter.js',
  'web/detail-ui.js',
  'web/favicon.ico',
  'web/favicon.png',
  'web/index.html',
  'web/styles.css'
]);
const UPDATE_ASSETS_PREFIX = 'web/assets/';
let updateInProgress = false;
let restartScheduled = false;
const PROTOCOL_MESSAGE_FIELDS = [
  'requestId', 'input', 'latestMsgTime', 'weworkCorpId', 'agentId', 'addTime',
  'weworkAccount', 'friendNick', 'friendExternalId', 'tagList', 'inputList',
  'weworkAccountAlias', 'friendRemoteId', 'lingxiAccount'
];
const CSV_CASE_FIELD_SOURCES = {
  id: ['id'],
  request_time: ['request_time'],
  input: ['input'],
  skip_reason: ['skip_reason'],
  modelName: ['modelName'],
  inputList: ['inputList', 'history'],
  tagList: ['tagList'],
  lingxiAccount: ['lingxiAccount']
};
const IMPORT_IGNORED_ID_FIELDS = ['requestId', 'weworkCorpId', 'weworkAccount', 'friendExternalId', 'friendRemoteId'];
const MQ_REQUIRED_ENV = ['MQ_GATEWAY_URL', 'MQ_APP_ID', 'MQ_TOPIC', 'MQ_PRODUCER_GROUP', 'MQ_SECRET_KEY', 'MQ_NAME_SERVER', 'MQ_MESSAGE_TYPE'];

const DEFAULT_CONFIG = {
  appName: 'AI 工作流消息测试平台',
  preferredPort: 32880,
  defaultAgentId: 'testId',
  defaultAlias: '汪洋老师',
  showDbAnalyticsTab: false,
  businessScenarios: [],
  userTags: [],
  sessionAttributeFields: [
    { key: 'agentId', label: '智能体ID', type: 'text' },
    { key: 'addTime', label: '添加时间', type: 'datetime-local' },
    { key: 'latestMsgTime', label: '最新消息时间', type: 'datetime-local' },
    { key: 'friendNick', label: '好友昵称', type: 'text' },
    { key: 'weworkAccountAlias', label: '企微账号别名', type: 'text' },
    { key: 'lingxiAccount', label: '灵犀后台账号名', type: 'text' }
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
  return UPDATE_ROOT_FILES.has(rel) || UPDATE_WEB_FILES.has(rel) || rel.startsWith(UPDATE_ASSETS_PREFIX);
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

function sourceFilePath(source, rel) {
  const root = String(source.contentRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return root ? `${root}/${rel}` : rel;
}

function githubFileUrl(source, rel) {
  const filePath = sourceFilePath(source, rel).split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${source.repository}/${encodeURIComponent(source.revision)}/${filePath}`;
}

function modelscopeFileUrl(source, rel) {
  const params = new URLSearchParams({
    Revision: source.revision,
    FilePath: sourceFilePath(source, rel)
  });
  return `https://www.modelscope.cn/api/v1/models/${source.repository}/repo?${params}`;
}

async function getGitHubRepositoryRelease(source) {
  const version = parseRemoteVersion(await fetchRemoteBuffer(githubFileUrl(source, 'version.json'), { maxBytes: 16 * 1024 }), source.label);
  let manifest;
  try {
    const manifestBuffer = await fetchRemoteBuffer(githubFileUrl(source, 'update-manifest.json'), { maxBytes: 512 * 1024 });
    manifest = validateUpdateManifest(JSON.parse(manifestBuffer.toString('utf8')));
  } catch (err) {
    if (err.statusCode) throw err;
    throw updateError('GitHub 更新清单不是有效 JSON', 502);
  }
  if (manifest.version !== version) throw updateError('GitHub 版本文件与更新清单版本不一致', 502);
  return {
    ...source,
    ref: source.revision,
    version,
    files: manifest.files,
    notes: manifest.notes,
    publishedAt: '',
    releaseName: `${source.repository}@${source.revision}`,
    fileUrl: rel => githubFileUrl(source, rel)
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
  if (source.type === 'github-repository') return getGitHubRepositoryRelease(source);
  if (source.type === 'modelscope-repository') return getModelScopeRelease(source);
  throw updateError(`未知更新源：${source.key}`, 500);
}

function getFallbackUpdateSource(source) {
  if (source?.key !== 'github') return null;
  return UPDATE_SOURCES.find(item => item.key === 'modelscope') || null;
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
    release: latest
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

function ensureUpdateFilePermissions(target, rel) {
  if (process.platform !== 'win32' && String(rel || '').endsWith('.command')) fs.chmodSync(target, 0o755);
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
    ensureUpdateFilePermissions(target, item.path);
    restored.push(item.path);
  });
  return { restored, previousVersion: String(metadata.previousVersion || '') };
}

function scheduleSelfRestart() {
  if (restartScheduled) return false;
  restartScheduled = true;
  const restartFile = path.join(UPDATE_DIR, `restart-${process.pid}-${Date.now()}.${process.platform === 'win32' ? 'bat' : 'sh'}`);
  const pid = process.pid;
  const port = Number(process.env.PORT || loadConfig().preferredPort || 32880);
  const nodeBinary = process.execPath;
  const serverFile = path.join(ROOT, 'server.js');
  try {
    if (process.platform === 'win32') {
      const script = `@echo off\r\ntimeout /t 2 /nobreak >nul\r\ntaskkill /F /PID ${pid} >nul 2>&1\r\ntimeout /t 1 /nobreak >nul\r\nset \"PORT=${port}\"\r\nstart \"\" /D \"${ROOT}\" \"${nodeBinary}\" \"${serverFile}\" --no-open\r\ndel \"%~f0\"\r\n`;
      fs.writeFileSync(restartFile, script, 'utf8');
      const child = spawn('cmd', ['/c', restartFile], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const logFile = path.join(CACHE_DIR, 'server.log');
      const quote = value => `'${String(value).replace(/'/g, "'\\\"'\\\"'")}'`;
      const script = `#!/bin/sh\nsleep 2\nkill -TERM ${pid} 2>/dev/null\nsleep 1\ncd ${quote(ROOT)}\nPORT=${quote(port)} nohup ${quote(nodeBinary)} ${quote(serverFile)} --no-open > ${quote(logFile)} 2>&1 &\nrm -- \"$0\"\n`;
      fs.writeFileSync(restartFile, script, { encoding: 'utf8', mode: 0o700 });
      fs.chmodSync(restartFile, 0o700);
      const child = spawn('/bin/sh', [restartFile], { detached: true, stdio: 'ignore' });
      child.unref();
    }
    return true;
  } catch (err) {
    restartScheduled = false;
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
    const stageRemoteUpdate = async updateSource => {
      let stageRoot = '';
      try {
        const release = await getLatestRelease(updateSource);
        if (!versionGreater(release.version, currentAppVersion())) throw updateError('所选更新源未提供更高版本', 409);
        stageRoot = path.join(UPDATE_STAGING_DIR, `${compactTime()}_${crypto.randomBytes(3).toString('hex')}`);
        for (const file of release.files) {
          const target = safeUpdatePath(stageRoot, file.path);
          const buffer = await fetchRemoteBuffer(release.fileUrl(file.path), { maxBytes: 20 * 1024 * 1024 });
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, buffer, { mode: 0o644 });
          if (sha256File(target) !== file.sha256) throw updateError(`文件校验失败：${file.path}`, 502);
        }
        return { release, source: updateSource, staging: stageRoot };
      } catch (err) {
        if (stageRoot) fs.rmSync(stageRoot, { recursive: true, force: true });
        throw err;
      }
    };
    let staged;
    let fallbackFrom = '';
    try {
      staged = await stageRemoteUpdate(source);
    } catch (err) {
      const fallbackSource = getFallbackUpdateSource(source);
      if (!fallbackSource || ![502, 504].includes(err.statusCode)) throw err;
      try {
        staged = await stageRemoteUpdate(fallbackSource);
        fallbackFrom = source.key;
      } catch (fallbackError) {
        throw updateError(`GitHub 下载失败，魔搭备用源也不可用：${fallbackError.message}`, fallbackError.statusCode || 502);
      }
    }
    const { release } = staged;
    staging = staged.staging;
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
        ensureUpdateFilePermissions(target, file.path);
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
      notes: release.notes,
      sourceKey: staged.source.key,
      sourceLabel: staged.source.label,
      fallbackFrom
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

function formatDbDisplayDateTime(value) {
  if (!value) return '';
  const pad = n => String(n).padStart(2, '0');
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  const text = String(value).trim();
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!matched) return text;
  const [, year, month, day, hour, minute, second] = matched;
  const dateText = `${year}-${month}-${day}`;
  if (!hour || !minute) return dateText;
  return `${dateText} ${hour}:${minute}:${second || '00'}`;
}

function formatDbDisplayDateTimeLoose(value) {
  const formatted = formatDbDisplayDateTime(value);
  if (formatted && formatted !== String(value).trim()) return formatted;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = n => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
  }
  return formatted;
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

function randomRequestId(corpId, sequence, weworkAccount = '', friendRemoteId = '') {
  const account = String(weworkAccount || '').trim() || NAMES[Math.floor(Math.random() * NAMES.length)];
  const remoteId = String(friendRemoteId || '').trim() || randDigits(14);
  const timestamp = Date.now() + Math.max(0, Number(sequence || 1) - 1);
  return `${corpId}_${account}_${remoteId}_${timestamp}`;
}

function sessionRequestId(session, sequence) {
  return randomRequestId(
    session.weworkCorpId,
    sequence,
    session.weworkAccount,
    session.friendRemoteId
  );
}

function conversationRequestId(identity) {
  const existingRequestId = String(identity.existingRequestId || '').trim();
  const existingParts = existingRequestId.split('_').filter(Boolean);
  if (existingParts.length >= 4) {
    return `${existingParts.slice(0, 3).join('_')}_${Date.now()}`;
  }
  const stablePrefix = [identity.weworkCorpId, identity.weworkAccount, identity.friendRemoteId]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('_');
  if (!stablePrefix) return randomRequestId(identity.weworkCorpId, 1);
  return `${stablePrefix}_${Date.now()}`;
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
  cfg.showDbAnalyticsTab = cfg.showDbAnalyticsTab === true;
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
        (Boolean(message.weworkAccountAlias) && message.weworkAccountAlias !== cfg.defaultAlias) ||
        (Boolean(message.lingxiAccount) && message.lingxiAccount !== 'mqSender')
      ))
    },
    message: {
      ...Object.fromEntries([
        'chatRoomName', 'chatRoomWxId', 'eventContent', 'chatRoomTagList', 'eventSourceType',
        'chatRoomRemoteId', 'conversationType', 'inputMessageList', 'weworkAccountName',
        'inputListMessageList'
      ].filter(key => message[key] !== undefined).map(key => [key, message[key]])),
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
      friendRemoteId: message.friendRemoteId || '',
      lingxiAccount: String(message.lingxiAccount || 'mqSender')
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

function deleteUnusedLabelManagementItems(body) {
  const type = body.type === 'businessScenarios' ? 'businessScenarios' : body.type === 'userTags' ? 'userTags' : '';
  if (!type) {
    const err = new Error('标签或业务场景类型不完整');
    err.statusCode = 400;
    throw err;
  }
  const cfg = loadConfig();
  const unusedNames = cfg[type].filter(item => !labelUsage(type, item.name).length).map(item => item.name);
  cfg[type] = cfg[type].filter(item => !unusedNames.includes(item.name));
  const nextConfig = normalizeConfig(cfg);
  writeJson(CONFIG_FILE, nextConfig);
  return { config: nextConfig, management: labelManagementData(), deletedCount: unusedNames.length };
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

function parseInputListEntry(value) {
  const raw = String(value || '');
  const separatorIndex = raw.indexOf(':');
  if (separatorIndex <= 0) return { remoteId: '', message: raw };
  return {
    remoteId: raw.slice(0, separatorIndex).trim(),
    message: raw.slice(separatorIndex + 1)
  };
}

function protocolMessageType(message) {
  try {
    const parsed = JSON.parse(message);
    return String(parsed?.messageType || 'text');
  } catch {
    return 'text';
  }
}

function remapStudentHistory(inputList, sourceFriendRemoteId, targetFriendRemoteId) {
  const sourceId = String(sourceFriendRemoteId || '').trim();
  const targetId = String(targetFriendRemoteId || '').trim();
  return (Array.isArray(inputList) ? inputList : []).map(value => {
    const entry = parseInputListEntry(value);
    if (!sourceId || !targetId || entry.remoteId !== sourceId) return String(value || '');
    return `${targetId}:${entry.message}`;
  });
}

function inputListMessageEntries(inputList, templates, fallbackTime) {
  const sourceTemplates = Array.isArray(templates) ? templates : [];
  return (Array.isArray(inputList) ? inputList : []).map((value, index) => {
    const entry = parseInputListEntry(value);
    const template = sourceTemplates[index] && typeof sourceTemplates[index] === 'object' ? sourceTemplates[index] : {};
    return {
      message: entry.message,
      remoteId: entry.remoteId || String(template.remoteId || ''),
      messageTime: formatDateForInput(template.messageTime || fallbackTime),
      messageType: String(template.messageType || protocolMessageType(entry.message))
    };
  });
}

function inputMessageEntries(input, friendRemoteId, messageTime) {
  return (Array.isArray(input) ? input : [input]).map(value => {
    const message = String(value || '');
    return {
      message,
      remoteId: String(friendRemoteId || ''),
      messageTime: formatDateForInput(messageTime),
      messageType: protocolMessageType(message)
    };
  });
}

function synchronizeProtocolMessageLists(payload, historyTemplates = []) {
  payload.inputListMessageList = inputListMessageEntries(payload.inputList, historyTemplates, payload.latestMsgTime);
  payload.inputMessageList = inputMessageEntries(payload.input, payload.friendRemoteId, payload.latestMsgTime);
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
    inputMessageList: [],
    inputListMessageList: [],
    weworkAccountAlias: msg.weworkAccountAlias || cfg.defaultAlias,
    friendRemoteId: session.friendRemoteId,
    lingxiAccount: String(msg.lingxiAccount || 'mqSender')
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
  const history = remapStudentHistory(c.message.inputList, c.message.friendRemoteId, session.friendRemoteId);
  const historyMessageList = inputListMessageEntries(history, c.message.inputListMessageList, c.message.latestMsgTime);
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
    payload.requestId = sessionRequestId(session, snapshots.length + 1);
    synchronizeProtocolMessageLists(payload, historyMessageList);
    snapshots.push({
      index: snapshots.length + 1,
      role: 'student',
      content: payload.input[0] || '',
      delaySeconds,
      payload
    });
    group.messages.forEach(item => {
      history.push(`${session.friendRemoteId}:${item.content}`);
      historyMessageList.push({
        message: String(item.content || ''),
        remoteId: session.friendRemoteId,
        messageTime: formatDateForInput(payload.latestMsgTime),
        messageType: protocolMessageType(String(item.content || ''))
      });
    });
  });

  if (snapshots.length === 0) {
    const payload = basePayload(c, session, agentId);
    payload.input = Array.isArray(c.message.input) && c.message.input.length ? [...c.message.input] : [''];
    payload.inputList = remapStudentHistory(c.message.inputList, c.message.friendRemoteId, session.friendRemoteId);
    applyAttributes(payload, unifiedAttrs);
    if (agentId) payload.agentId = agentId;
    applyIdentityLinks(payload, session);
    payload.requestId = sessionRequestId(session, 1);
    synchronizeProtocolMessageLists(payload, c.message.inputListMessageList);
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
    name: value.name === undefined ? String(existing.name || '').trim() : String(value.name || '').trim(),
    gatewayUrl: String(value.gatewayUrl || existing.gatewayUrl || '').trim().replace(/\/+$/, ''),
    appId: String(value.appId || existing.appId || '').trim(),
    topic: String(value.topic || existing.topic || '').trim(),
    producerGroup: String(value.producerGroup || existing.producerGroup || '').trim(),
    secretKey: String(value.secretKey || existing.secretKey || '').trim(),
    nameServer: String(value.nameServer || existing.nameServer || '').trim(),
    messageType: String(value.messageType || existing.messageType || '').trim()
  };
  if (Object.entries(config).some(([key, value]) => !['id', 'name'].includes(key) && !value)) {
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
  if (config.name && configs.some(item => item.id !== config.id && item.name === config.name)) {
    const err = new Error('MQ 配置名称已存在');
    err.statusCode = 400;
    throw err;
  }
  if (existingIndex >= 0) configs[existingIndex] = config;
  else configs.push(config);
  writePrivateJson(MQ_CONFIGS_FILE, { configs });
  return publicMqConfig(config);
}

function deleteMqConfig(configId) {
  const idValue = String(configId || '').trim();
  const configs = readMqConfigs();
  const existingIndex = configs.findIndex(config => config.id === idValue);
  if (existingIndex < 0) {
    const err = new Error('MQ 配置不存在');
    err.statusCode = 404;
    throw err;
  }
  configs.splice(existingIndex, 1);
  writePrivateJson(MQ_CONFIGS_FILE, { configs });
}

function mqConfig(configId) {
  const configs = readMqConfigs();
  const selected = configId ? configs.find(config => config.id === configId) : configs[0];
  if (selected) return selected;
  return environmentMqConfig();
}

const DB_ENVIRONMENTS = new Set(['production', 'test']);

function dbEnvironmentOf(value, fallback = 'production') {
  const environment = String(value || '').trim();
  if (!environment) return fallback;
  return DB_ENVIRONMENTS.has(environment) ? environment : fallback;
}

function dbConfigRecord(value, existing = {}) {
  const port = Number(value.port || existing.port || 5432);
  const inputEnvironment = String(value.environment || '').trim();
  if (!DB_ENVIRONMENTS.has(inputEnvironment)) {
    const err = new Error('请选择数据库环境（线上环境或测试环境）');
    err.statusCode = 400;
    throw err;
  }
  const config = {
    id: existing.id || value.id || id('db'),
    name: value.name === undefined ? String(existing.name || '').trim() : String(value.name || '').trim(),
    host: String(value.host || existing.host || '').trim(),
    port: Number.isFinite(port) && port > 0 ? port : 5432,
    database: String(value.database || existing.database || '').trim(),
    user: String(value.user || existing.user || '').trim(),
    password: String(value.password || existing.password || ''),
    environment: inputEnvironment
  };
  if (Object.entries(config).some(([key, item]) => !['id', 'name', 'password'].includes(key) && !String(item || '').trim())) {
    const err = new Error('数据库配置填写不完整');
    err.statusCode = 400;
    throw err;
  }
  if (!config.password) {
    const err = new Error('数据库密码未配置');
    err.statusCode = 400;
    throw err;
  }
  return config;
}

function readDbConfigs() {
  const data = readJson(DB_CONFIGS_FILE, { configs: [] });
  return Array.isArray(data?.configs) ? data.configs : [];
}

function publicDbConfig(config) {
  return {
    id: config.id,
    name: String(config.name || '').trim().replace(/\s{2,}/g, ' '),
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    environment: DB_ENVIRONMENTS.has(String(config.environment || '').trim()) ? config.environment : '',
    hasPassword: Boolean(config.password)
  };
}

function saveDbConfig(value) {
  const configs = readDbConfigs();
  const existingIndex = value.id ? configs.findIndex(config => config.id === value.id) : -1;
  const config = dbConfigRecord(value, existingIndex >= 0 ? configs[existingIndex] : {});
  if (config.name && configs.some(item => item.id !== config.id && item.name === config.name)) {
    const err = new Error('数据库配置名称已存在');
    err.statusCode = 400;
    throw err;
  }
  if (existingIndex >= 0) configs[existingIndex] = config;
  else configs.push(config);
  clearDbConversationCandidateCache();
  writePrivateJson(DB_CONFIGS_FILE, { configs });
  return publicDbConfig(config);
}

async function deleteDbConfig(configId) {
  const idValue = String(configId || '').trim();
  const configs = readDbConfigs();
  const existingIndex = configs.findIndex(config => config.id === idValue);
  if (existingIndex < 0) {
    const err = new Error('数据库配置不存在');
    err.statusCode = 404;
    throw err;
  }
  const [config] = configs.splice(existingIndex, 1);
  clearDbConversationCandidateCache();
  const deletingConnectedConfig = dbConnectionState.configId === config.id
    && dbConnectionState.fingerprint === dbConnectionFingerprint(config);
  if (deletingConnectedConfig) {
    const pool = dbPool;
    dbPool = null;
    dbPoolFingerprint = '';
    dbConnectionState = { configId: '', fingerprint: '', status: 'disconnected', errorMessage: '' };
    if (pool) await pool.end().catch(() => {});
  }
  writePrivateJson(DB_CONFIGS_FILE, { configs });
}

function dbConversationFilterValues(value = {}) {
  return {
    workflowId: String(value.workflowId || '').trim(),
    conversationId: String(value.conversationId || '').trim(),
    friendNick: String(value.friendNick || '').trim(),
    keyword: String(value.keyword || '').trim(),
    hasError: ['true', 'false'].includes(String(value.hasError || '')) ? String(value.hasError) : ''
  };
}

function readDbConversationFilters() {
  const data = readJson(DB_CONVERSATION_FILTERS_FILE, { filters: [] });
  return Array.isArray(data?.filters) ? data.filters : [];
}

function publicDbConversationFilter(filter) {
  return {
    id: filter.id,
    name: filter.name,
    filters: dbConversationFilterValues(filter.filters)
  };
}

function saveDbConversationFilter(value) {
  const name = String(value.name || '').trim();
  const filters = dbConversationFilterValues(value.filters);
  if (!name) {
    const err = new Error('请输入筛选条件名称');
    err.statusCode = 400;
    throw err;
  }
  if (!filters.workflowId) {
    const err = new Error('工作流ID为必填项，无法保存空筛选条件');
    err.statusCode = 400;
    throw err;
  }
  const savedFilters = readDbConversationFilters();
  if (savedFilters.some(filter => filter.name === name)) {
    const err = new Error('筛选条件名称已存在');
    err.statusCode = 400;
    throw err;
  }
  const filter = { id: id('db_filter'), name, filters };
  savedFilters.push(filter);
  writePrivateJson(DB_CONVERSATION_FILTERS_FILE, { filters: savedFilters });
  return publicDbConversationFilter(filter);
}

function deleteDbConversationFilter(filterId) {
  const savedFilters = readDbConversationFilters();
  const nextFilters = savedFilters.filter(filter => filter.id !== filterId);
  if (nextFilters.length === savedFilters.length) {
    const err = new Error('筛选条件不存在');
    err.statusCode = 404;
    throw err;
  }
  writePrivateJson(DB_CONVERSATION_FILTERS_FILE, { filters: nextFilters });
}

function dbConfig(configId) {
  const configs = readDbConfigs();
  const selected = configId ? configs.find(config => config.id === configId) : configs[0];
  if (!selected) {
    const err = new Error('请先配置数据库连接');
    err.statusCode = 400;
    throw err;
  }
  return selected;
}

function requireTestDbConversationConfig(configId) {
  const selectedConfigId = String(configId || '').trim();
  if (!selectedConfigId) {
    const err = new Error('缺少数据库配置');
    err.statusCode = 400;
    throw err;
  }
  const config = dbConfig(selectedConfigId);
  if (dbEnvironmentOf(config.environment) !== 'test') {
    const err = new Error('线上环境数据库不允许发送新消息或预览消息 JSON');
    err.statusCode = 403;
    throw err;
  }
  return config;
}

function requirePg() {
  try {
    const pg = require('pg');
    // 数据库使用 timestamp without time zone，保留原始文本以避免 Node.js 时区转换改变日期。
    pg.types.setTypeParser(1114, value => value);
    return pg;
  } catch (err) {
    const error = new Error('缺少 pg 依赖，请重新启动应用以自动安装；若仍失败请检查网络');
    error.statusCode = 500;
    throw error;
  }
}

let dbClientQueue = Promise.resolve();
let dbPool = null;
let dbPoolFingerprint = '';
let dbConnectionState = { configId: '', fingerprint: '', status: 'disconnected', errorMessage: '' };

function dbConnectionFingerprint(config) {
  return JSON.stringify([config.host, config.port, config.database, config.user, config.password]);
}

function setDbConnectionState(config, status, errorMessage = '') {
  dbConnectionState = {
    configId: config.id,
    fingerprint: dbConnectionFingerprint(config),
    status,
    errorMessage: String(errorMessage || '')
  };
}

function dbConnectionStatus(configId = '') {
  const configs = readDbConfigs();
  const activeConfig = configs.find(config => config.id === dbConnectionState.configId
    && dbConnectionFingerprint(config) === dbConnectionState.fingerprint);
  const config = configId
    ? configs.find(item => item.id === configId)
    : activeConfig || configs[0];
  if (!config) {
    return { configId: '', name: '未配置数据库', status: 'disconnected', errorMessage: '' };
  }
  const fingerprint = dbConnectionFingerprint(config);
  const connectedConfig = dbConnectionState.configId === config.id && dbConnectionState.fingerprint === fingerprint;
  return {
    configId: config.id,
    name: String(config.name || '').trim().replace(/\s{2,}/g, ' ') || '未命名数据库',
    status: connectedConfig ? dbConnectionState.status : 'disconnected',
    errorMessage: connectedConfig ? dbConnectionState.errorMessage : ''
  };
}

function normalizeDbConnectionError(err) {
  if (err?.code === '53300' || /remaining connection slots are reserved/i.test(String(err?.message || ''))) {
    const error = new Error('数据库连接数已满，当前只读账号暂时无法获取连接。请稍后重试，或联系数据库管理员释放连接/提高连接数。');
    error.statusCode = 503;
    return error;
  }
  return err;
}

function dbPoolForConfig(Pool, config, fingerprint) {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 3,
    idleTimeoutMillis: 60 * 60 * 1000,
    connectionTimeoutMillis: 5000
  });
  pool.on('error', err => {
    if (dbPool !== pool || dbPoolFingerprint !== fingerprint) return;
    const error = normalizeDbConnectionError(err);
    setDbConnectionState(config, 'error', error.message);
  });
  pool.on('remove', () => {
    // pg 在空闲超时后移除最后一个客户端时，连接池还在但已没有实际数据库连接。
    setImmediate(() => {
      if (dbPool !== pool || dbPoolFingerprint !== fingerprint || pool.totalCount > 0) return;
      setDbConnectionState(config, 'disconnected');
    });
  });
  return pool;
}

async function withDbClient(configId, callback, { allowConnect = false } = {}) {
  return withDbClientOnce(configId, callback, { allowConnect });
}

async function withDbClientQueue(callback) {
  let releaseQueue;
  const previous = dbClientQueue.catch(() => {});
  dbClientQueue = new Promise(resolve => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await callback();
  } finally {
    releaseQueue();
  }
}

async function withDbClientOnce(configId, callback, { allowConnect = false } = {}) {
  const config = dbConfig(configId);
  const fingerprint = dbConnectionFingerprint(config);
  const connection = dbConnectionStatus(config.id);
  if (!allowConnect && (!dbPool || dbPoolFingerprint !== fingerprint || connection.status !== 'connected')) {
    const error = new Error('数据库未连接，请先点击“建立连接”后再查询');
    error.statusCode = 409;
    throw error;
  }
  const { Pool } = requirePg();
  if (!dbPool || dbPoolFingerprint !== fingerprint) {
    const previousPool = dbPool;
    dbPool = dbPoolForConfig(Pool, config, fingerprint);
    dbPoolFingerprint = fingerprint;
    if (previousPool) previousPool.end().catch(() => {});
  }
  const pool = dbPool;
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    const error = normalizeDbConnectionError(err);
    setDbConnectionState(config, 'error', error.message);
    throw error;
  }
  setDbConnectionState(config, 'connected');
  try {
    await client.query('BEGIN READ ONLY');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const error = normalizeDbConnectionError(err);
    setDbConnectionState(config, 'error', error.message);
    throw error;
  } finally {
    client.release();
  }
}

function parseDbJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (err) {
    try {
      let inString = false;
      let escaped = false;
      let normalized = '';
      for (const char of String(value)) {
        if (!inString) {
          normalized += char;
          if (char === '"') inString = true;
          continue;
        }
        if (escaped) {
          normalized += char;
          escaped = false;
          continue;
        }
        if (char === '\\') {
          normalized += char;
          escaped = true;
          continue;
        }
        if (char === '"') {
          normalized += char;
          inString = false;
          continue;
        }
        const code = char.charCodeAt(0);
        normalized += code < 0x20
          ? `\\u${code.toString(16).padStart(4, '0')}`
          : char;
      }
      return JSON.parse(normalized);
    } catch (normalizedError) {
      return fallback;
    }
  }
}

function dbKey(workflowId, conversationId) {
  return `${String(workflowId || '')}\n${String(conversationId || '')}`;
}

function executionHasError(execution) {
  return Boolean(
    String(execution.error_message || '').trim() ||
    String(execution.error_class || '').trim() ||
    String(execution.error_code || '').trim() ||
    (execution.status && !['SUCCESS', 'COMPLETED'].includes(String(execution.status).toUpperCase()))
  );
}

const DB_TRIGGER_CHANNEL_FALLBACK_JOIN = `LEFT JOIN LATERAL (
  SELECT c.raw_data
  FROM public.channel_messages c
  WHERE (e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器')
    AND (e.outputs IS NULL OR e.outputs::jsonb = '{}'::jsonb)
    AND c.event_id = e.event_id
    AND c.deleted_at IS NULL
  ORDER BY c.id DESC
  LIMIT 1
) cm ON TRUE`;
const DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL = `COALESCE(NULLIF(e.outputs::jsonb, '{}'::jsonb), cm.raw_data)`;

function dbTriggerIdOf(item) {
  return String(item?.event_id ?? item?.eventId ?? item?.trigger_message_id ?? item?.triggerMessageId ?? item?.requestid ?? item?.requestId ?? '');
}

function dbWorkflowIdOf(item) {
  return String(item?.workflow_id ?? item?.workflowId ?? '');
}

function dbInputText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(dbInputText).filter(Boolean).join('\n');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function dbTriggerExecutionInput(execution) {
  const nodeName = String(execution.node_name ?? execution.nodeName ?? '').trim();
  const nodeType = String(execution.node_type ?? execution.nodeType ?? '').trim();
  if (nodeType !== 'lingxi_trigger' && nodeName !== '灵犀触发器') return '';
  const outputs = parseDbJson(execution.outputs, execution.outputs || null);
  return dbInputText(outputs?.input);
}

function dbNodeIdOf(execution) {
  return String(execution?.node_id ?? execution?.nodeId ?? '');
}

function dbOwnValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function dbNodeOutputValue(execution, field) {
  const outputs = parseDbJson(execution?.outputs, execution?.outputs || null);
  return dbOwnValue(outputs, field);
}

function dbReferencedOutputNodeIds(executions = []) {
  const nodeIds = new Set();
  const referencePattern = /@node\.([^.\s}]+)\.[A-Za-z0-9_]+/g;
  executions.forEach(execution => {
    if (String(execution.node_type ?? execution.nodeType ?? '') !== 'lingxi_send') return;
    const inputs = parseDbJson(execution.inputs, execution.inputs || null);
    const contentConfig = parseDbJson(inputs?.content, inputs?.content || null);
    const serialized = JSON.stringify(contentConfig || inputs || {});
    let matched;
    while ((matched = referencePattern.exec(serialized))) nodeIds.add(matched[1]);
  });
  return [...nodeIds];
}

function dbLocalInputValue(localInputs, field) {
  const direct = dbOwnValue(localInputs, field);
  if (direct !== undefined) return direct;
  return dbOwnValue(localInputs?.inputs, field);
}

function dbResolveSendExpression(expression, localInputs, executionsByNodeId) {
  const expr = String(expression || '').trim();
  const nodeMatched = expr.match(/^@node\.([^.]+)\.([A-Za-z0-9_]+)$/);
  if (nodeMatched) return dbNodeOutputValue(executionsByNodeId.get(nodeMatched[1]), nodeMatched[2]);
  return dbLocalInputValue(localInputs, expr);
}

function dbResolveSendContent(value, localInputs, executionsByNodeId) {
  const text = dbInputText(value);
  if (!text) return value === null ? null : '';
  const singleReference = text.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (singleReference) {
    const resolved = dbResolveSendExpression(singleReference[1], localInputs, executionsByNodeId);
    if (resolved === undefined) return '';
    return resolved === null ? null : dbInputText(resolved);
  }
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    const resolved = dbResolveSendExpression(expression, localInputs, executionsByNodeId);
    return resolved === undefined || resolved === null ? '' : dbInputText(resolved);
  }).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function dbSendContentConfig(execution, inputs) {
  const logs = parseDbJson(execution?.logs, execution?.logs || []);
  const messageContent = Array.isArray(logs)
    ? logs.findLast?.(item => item?.msg === 'Message content' && item?.data?.content)?.data?.content
      ?? [...logs].reverse().find(item => item?.msg === 'Message content' && item?.data?.content)?.data?.content
    : '';
  const resolvedConfig = parseDbJson(messageContent, null);
  if (resolvedConfig && typeof resolvedConfig === 'object' && resolvedConfig.actions) return resolvedConfig;
  return parseDbJson(inputs?.content, inputs?.content || null);
}

function dbSendExecutionContent(execution, executionsByNodeId) {
  if (String(execution.node_type ?? execution.nodeType ?? '') !== 'lingxi_send') return { found: false, value: '' };
  const inputs = parseDbJson(execution.inputs, execution.inputs || null);
  if (!inputs || typeof inputs !== 'object') return { found: false, value: '' };
  const contentConfig = dbSendContentConfig(execution, inputs);
  const actions = Array.isArray(contentConfig?.actions) ? contentConfig.actions : [contentConfig?.actions].filter(Boolean);
  const replyAction = actions.find(action => Number(action?.actionType) === 6);
  if (!replyAction) return { found: false, value: '' };
  const localInputs = contentConfig && typeof contentConfig === 'object' ? { ...contentConfig, ...inputs } : inputs;
  return { found: true, value: dbResolveSendContent(replyAction.actionContent, localInputs, executionsByNodeId) };
}

function dbSendExecutionPreview(execution, executionsByNodeId) {
  if (String(execution.node_type ?? execution.nodeType ?? '') !== 'lingxi_send') return { label: '', content: '' };
  const inputs = parseDbJson(execution.inputs, execution.inputs || null);
  if (!inputs || typeof inputs !== 'object') return { label: '', content: '' };
  const contentConfig = dbSendContentConfig(execution, inputs);
  const actions = Array.isArray(contentConfig?.actions) ? contentConfig.actions : [contentConfig?.actions].filter(Boolean);
  const localInputs = contentConfig && typeof contentConfig === 'object' ? { ...contentConfig, ...inputs } : inputs;
  const replyAction = actions.find(item => Number(item?.actionType) === 6);
  if (replyAction) {
    return {
      label: 'AI回复',
      content: dbResolveSendContent(replyAction.actionContent, localInputs, executionsByNodeId)
    };
  }
  const tagActions = actions.filter(item => Number(item?.actionType) === 4);
  if (tagActions.length) {
    const content = tagActions.map(action => {
      const value = dbResolveSendContent(action.actionContent, localInputs, executionsByNodeId);
      return `${Number(action?.tagOperateType) === 2 ? '-' : '+'}${value === null ? 'null' : dbInputText(value)}`;
    }).join(' / ');
    return { label: '打标签', content };
  }
  const action = actions.find(item => Object.prototype.hasOwnProperty.call(item || {}, 'actionContent'));
  return action
    ? { label: '消息推送', content: dbResolveSendContent(action.actionContent, localInputs, executionsByNodeId) }
    : { label: '', content: '' };
}

function dbSendExecutionActions(execution, executionsByNodeId) {
  if (String(execution.node_type ?? execution.nodeType ?? '') !== 'lingxi_send') return [];
  const inputs = parseDbJson(execution.inputs, execution.inputs || null);
  if (!inputs || typeof inputs !== 'object') return [];
  const contentConfig = dbSendContentConfig(execution, inputs);
  const actions = Array.isArray(contentConfig?.actions) ? contentConfig.actions : [contentConfig?.actions].filter(Boolean);
  const localInputs = contentConfig && typeof contentConfig === 'object' ? { ...contentConfig, ...inputs } : inputs;
  return actions
    .filter(action => Number(action?.actionType) === 4)
    .map(action => {
      const operateType = Number(action?.tagOperateType);
      const content = dbResolveSendContent(action.actionContent, localInputs, executionsByNodeId);
      return {
        actionType: 'tag',
        actionLabel: '打标签',
        tagOperateType: operateType,
        content,
        startedAt: execution.started_at || ''
      };
    });
}

function dbSetVariableAssignments(execution) {
  const inputs = parseDbJson(execution.inputs, execution.inputs || null) || {};
  const outputs = parseDbJson(execution.outputs, execution.outputs || null) || {};
  const inputAssignments = Array.isArray(inputs.assignments)
    ? inputs.assignments
    : inputs.variableKey ? [{ variableKey: inputs.variableKey, variableValue: inputs.variableValue ?? inputs.value }] : [];
  const outputAssignments = Array.isArray(outputs.assignments) ? outputs.assignments : [];
  const outputValues = new Map(outputAssignments
    .filter(item => item && (item.key || item.variableKey))
    .map(item => [String(item.key || item.variableKey), item.value ?? item.variableValue]));
  const assignments = inputAssignments
    .filter(item => item && (item.variableKey || item.key))
    .map(item => {
      const key = String(item.variableKey || item.key);
      return {
        key,
        value: outputValues.has(key)
          ? outputValues.get(key)
          : Object.prototype.hasOwnProperty.call(outputs, key) ? dbOwnValue(outputs, key) : item.variableValue ?? item.value
      };
    });
  if (assignments.length) return assignments;
  if (outputAssignments.length) {
    return outputAssignments
      .filter(item => item && (item.key || item.variableKey))
      .map(item => ({ key: String(item.key || item.variableKey), value: item.value ?? item.variableValue }));
  }
  return [];
}

function dbActionEventSignature(event) {
  return JSON.stringify({
    actionType: event.actionType || '',
    nodeId: event.nodeId || '',
    nodeName: event.nodeName || '',
    tagOperateType: event.tagOperateType ?? '',
    content: event.content ?? '',
    assignments: event.assignments || []
  });
}

function dbDeduplicateActionEvents(events = []) {
  const seen = new Set();
  return events.filter(event => {
    const signature = dbActionEventSignature(event);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function dbExecutionActionEvents(executions = []) {
  const result = new Map();
  const executionsByTrigger = new Map();
  executions.forEach(execution => {
    const workflowId = dbWorkflowIdOf(execution);
    const triggerId = dbTriggerIdOf(execution);
    if (!workflowId || !triggerId) return;
    const key = `${workflowId}\n${triggerId}`;
    if (!executionsByTrigger.has(key)) executionsByTrigger.set(key, []);
    executionsByTrigger.get(key).push(execution);
  });
  executionsByTrigger.forEach((items, key) => {
    const executionsByNodeId = new Map();
    items.forEach(execution => {
      const nodeId = dbNodeIdOf(execution);
      if (nodeId) executionsByNodeId.set(nodeId, execution);
    });
    const events = [];
    items.forEach(execution => {
      const nodeType = String(execution.node_type ?? execution.nodeType ?? '');
      const nodeName = String(execution.node_name ?? execution.nodeName ?? dbNodeIdOf(execution) ?? '');
      if (nodeType === 'set_variable') {
        events.push({
          actionType: 'set_variable',
          actionLabel: '设置变量',
          nodeId: dbNodeIdOf(execution),
          nodeName: nodeName || '设置变量',
          assignments: dbSetVariableAssignments(execution),
          startedAt: execution.started_at || ''
        });
      } else if (nodeType === 'http_request') {
        events.push({
          actionType: 'http_request',
          actionLabel: 'HTTP请求',
          nodeId: dbNodeIdOf(execution),
          nodeName: nodeName || 'HTTP请求',
          startedAt: execution.started_at || ''
        });
      } else {
        events.push(...dbSendExecutionActions(execution, executionsByNodeId));
      }
    });
    result.set(key, dbDeduplicateActionEvents(events)
      .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || ''))));
  });
  return result;
}

function dbTriggerInputMap(executions = []) {
  const result = new Map();
  executions.forEach(execution => {
    const workflowId = dbWorkflowIdOf(execution);
    const triggerId = dbTriggerIdOf(execution);
    if (!workflowId || !triggerId) return;
    const content = dbTriggerExecutionInput(execution);
    if (content && !result.has(`${workflowId}\n${triggerId}`)) result.set(`${workflowId}\n${triggerId}`, content);
  });
  return result;
}

function dbAssistantReplyMap(executions = []) {
  const result = new Map();
  dbAssistantReplySelectionMap(executions).forEach((selected, key) => {
    result.set(key, selected.reply.value);
  });
  return result;
}

function dbAssistantReplySelectionMap(executions = []) {
  const result = new Map();
  const executionsByTrigger = new Map();
  executions.forEach(execution => {
    const workflowId = dbWorkflowIdOf(execution);
    const triggerId = dbTriggerIdOf(execution);
    if (!workflowId || !triggerId) return;
    const key = `${workflowId}\n${triggerId}`;
    if (!executionsByTrigger.has(key)) executionsByTrigger.set(key, []);
    executionsByTrigger.get(key).push(execution);
  });
  executionsByTrigger.forEach((items, key) => {
    const executionsByNodeId = new Map();
    items.forEach(execution => {
      const nodeId = dbNodeIdOf(execution);
      if (nodeId) executionsByNodeId.set(nodeId, execution);
    });
    const replies = items
      .map((execution, index) => ({ execution, index, reply: dbSendExecutionContent(execution, executionsByNodeId) }))
      .filter(item => item.reply.found)
      .sort((a, b) => {
        const aTime = String(a.execution.started_at ?? a.execution.startedAt ?? '');
        const bTime = String(b.execution.started_at ?? b.execution.startedAt ?? '');
        const timeOrder = aTime.localeCompare(bTime);
        return timeOrder || a.index - b.index;
      });
    const successfulReplies = replies.filter(item => !executionHasError(item.execution));
    const selected = successfulReplies.at(-1) || replies.at(-1);
    if (selected) result.set(key, selected);
  });
  return result;
}

function dbTriggerLatestMsgTimeMap(executions = []) {
  const result = new Map();
  executions.forEach(execution => {
    const nodeType = String(execution.node_type ?? execution.nodeType ?? '');
    const nodeName = String(execution.node_name ?? execution.nodeName ?? '').trim();
    if (nodeType !== 'lingxi_trigger' && nodeName !== '灵犀触发器') return;
    const key = dbTriggerKeyOf(execution);
    if (!key || result.has(key)) return;
    const outputs = parseDbJson(execution.outputs, execution.outputs || null);
    const latestMsgTime = outputs?.latestMsgTime ?? outputs?.latest_msg_time;
    if (latestMsgTime) result.set(key, latestMsgTime);
  });
  return result;
}

function dbTriggerMetaMap(executions = []) {
  const result = new Map();
  executions.forEach(execution => {
    const nodeType = String(execution.node_type ?? execution.nodeType ?? '');
    const nodeName = String(execution.node_name ?? execution.nodeName ?? '').trim();
    if (nodeType !== 'lingxi_trigger' && nodeName !== '灵犀触发器') return;
    const key = dbTriggerKeyOf(execution);
    if (!key || result.has(key)) return;
    const outputs = parseDbJson(execution.outputs, execution.outputs || null);
    result.set(key, {
      conversationType: Number(outputs?.conversationType) || 0,
      chatRoomName: String(outputs?.chatRoomName || '').trim(),
      chatRoomWxId: String(outputs?.chatRoomWxId || '').trim(),
      chatRoomRemoteId: String(outputs?.chatRoomRemoteId || '').trim(),
      eventContent: String(outputs?.eventContent || '').trim(),
      eventSourceType: Number(outputs?.eventSourceType) || 0
    });
  });
  return result;
}

function dbAssistantReplyTimeMap(executions = []) {
  const result = new Map();
  dbAssistantReplySelectionMap(executions).forEach((selected, key) => {
    const startedAt = selected.execution?.started_at ?? selected.execution?.startedAt;
    if (startedAt) result.set(key, startedAt);
  });
  return result;
}

function dbMessageDisplayContent(message, triggerInputs, assistantReplies) {
  const role = String(message.role || '').toUpperCase();
  const workflowId = dbWorkflowIdOf(message);
  const triggerId = dbTriggerIdOf(message);
  if (role === 'USER') return triggerInputs.get(`${workflowId}\n${triggerId}`) || String(message.content || '');
  if (role === 'ASSISTANT') {
    const key = `${workflowId}\n${triggerId}`;
    return assistantReplies.has(key) ? assistantReplies.get(key) : '不回复';
  }
  return String(message.content || '');
}

function dbTriggerKeyOf(item) {
  return `${dbWorkflowIdOf(item)}\n${dbTriggerIdOf(item)}`;
}

function dbFindJsonField(value, fieldName) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = dbFindJsonField(item, fieldName);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === fieldName.toLowerCase()) return item;
    const result = dbFindJsonField(item, fieldName);
    if (result !== undefined) return result;
  }
  return undefined;
}

function dbConversationFriendNick(executions = []) {
  for (const execution of executions) {
    const nodeType = String(execution.node_type || execution.nodeType || '');
    const nodeName = String(execution.node_name || execution.nodeName || '');
    if (!nodeType.includes('lingxi') && !nodeName.includes('灵犀')) continue;
    const friendNick = dbFindJsonField(parseDbJson(execution.inputs, null), 'friendNick')
      ?? dbFindJsonField(parseDbJson(execution.outputs, null), 'friendNick');
    if (friendNick !== undefined && friendNick !== null && String(friendNick).trim()) return String(friendNick).trim();
  }
  return '';
}

function dbExecutionFailed(execution) {
  const status = String(execution.status || '').toUpperCase();
  return Boolean(execution.error_message || execution.error_class || execution.error_code)
    || ['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED', 'TIMEOUT', 'ABORTED'].includes(status);
}

function dbWorkflowTerminalNodeIds(workflowGraph = {}) {
  const nodes = Array.isArray(workflowGraph.nodes) ? workflowGraph.nodes : [];
  return new Set(nodes
    .filter(node => {
      const nodeType = String(node.type || node.nodeType || node.data?.nodeType || '').toLowerCase();
      return nodeType === 'output';
    })
    .map(node => String(node.id)));
}

const DB_REPLY_SETTLE_MS = 15000;

function dbExecutionTimeMs(execution) {
  const value = execution.completed_at ?? execution.started_at ?? execution.completedAt ?? execution.startedAt;
  if (value instanceof Date) return value.getTime();
  const timestamp = Date.parse(String(value || '').replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dbTriggerExecutionStates(executions = [], terminalNodeIds = new Set()) {
  const states = new Map();
  executions.forEach(execution => {
    const key = dbTriggerKeyOf(execution);
    if (!key) return;
    const state = states.get(key) || { started: false, finished: false, settled: false, failed: false, lastExecutionAt: 0, lastExecutionIsOutput: false };
    state.started = true;
    state.failed ||= dbExecutionFailed(execution);
    const nodeId = dbNodeIdOf(execution);
    const nodeType = String(execution.node_type || execution.nodeType || '').toLowerCase();
    const executionTime = dbExecutionTimeMs(execution);
    if (executionTime >= state.lastExecutionAt) {
      state.lastExecutionAt = executionTime;
      state.lastExecutionIsOutput = nodeType === 'output' || terminalNodeIds.has(nodeId);
    }
    states.set(key, state);
  });
  const now = Date.now();
  states.forEach(state => {
    state.finished = state.lastExecutionIsOutput;
    state.settled = state.finished && state.lastExecutionAt > 0 && now - state.lastExecutionAt >= DB_REPLY_SETTLE_MS;
  });
  return states;
}

function dbConversationDisplayMessages(sortedMessages, executions, triggerInputs, assistantReplies, terminalNodeIds, triggerLatestMsgTimes = new Map(), assistantReplyTimes = new Map(), triggerMeta = new Map()) {
  const actionEventsByTrigger = dbExecutionActionEvents(executions);
  const executionStates = dbTriggerExecutionStates(executions, terminalNodeIds);
  const assistantMessagesByTrigger = new Map();
  sortedMessages
    .filter(message => String(message.role || '').toUpperCase() === 'ASSISTANT' && dbTriggerIdOf(message))
    .forEach(message => {
      const key = dbTriggerKeyOf(message);
      if (!assistantMessagesByTrigger.has(key)) assistantMessagesByTrigger.set(key, message);
    });
  return sortedMessages
    .filter(message => String(message.role || '').toUpperCase() === 'USER' && dbTriggerIdOf(message))
    .flatMap(message => {
      const key = dbTriggerKeyOf(message);
      const executionState = executionStates.get(key) || { started: false, finished: false, settled: false, failed: false };
      const assistantMessage = assistantMessagesByTrigger.get(key);
      const meta = triggerMeta.get(key);
      const conversationType = Number(meta?.conversationType) || 0;
      const isEventMessage = conversationType === 3;
      const chatRoomName = String(meta?.chatRoomName || '').trim();
      const hasReplyAction = assistantReplies.has(key) || Boolean(assistantMessage);
      const assistantContent = assistantReplies.has(key) ? assistantReplies.get(key) : String(assistantMessage?.content || '');
      const waitingForReply = executionState.started
        && executionState.finished
        && !executionState.failed
        && !hasReplyAction
        && !executionState.settled;
      const actionEvents = (actionEventsByTrigger.get(key) || []).map((event, index) => ({
        id: `${dbTriggerIdOf(message)}:action:${index}`,
        triggerMessageId: dbTriggerIdOf(message),
        workflowId: String(message.workflow_id || ''),
        conversationId: message.conversation_id || '',
        role: 'ACTION',
        actionType: event.actionType || '',
        actionLabel: event.actionLabel,
        tagOperateType: event.tagOperateType,
        nodeId: event.nodeId || '',
        nodeName: event.nodeName || '',
        assignments: event.assignments || [],
        content: event.content,
        contentType: 'TEXT',
        messageTimestamp: formatDbDisplayDateTimeLoose(event.startedAt || message.message_timestamp)
      }));
      return [
        {
          id: message.id,
          triggerMessageId: dbTriggerIdOf(message),
          workflowId: String(message.workflow_id || ''),
          conversationId: message.conversation_id || '',
          role: message.role || 'USER',
          processed: executionState.started,
          processing: executionState.started && !executionState.failed && (!executionState.finished || waitingForReply),
          failed: executionState.failed,
          hasReplyAction,
          content: isEventMessage ? (meta?.eventContent || '') : dbMessageDisplayContent(message, triggerInputs, assistantReplies),
          contentType: message.content_type || '',
          conversationType,
          chatRoomName,
          messageTimestamp: formatDbDisplayDateTimeLoose(triggerLatestMsgTimes.get(key) || message.message_timestamp)
        },
        ...(hasReplyAction ? [{
          id: assistantMessage?.id || `${dbTriggerIdOf(message)}:assistant`,
          triggerMessageId: dbTriggerIdOf(message),
          workflowId: String(assistantMessage?.workflow_id || message.workflow_id || ''),
          conversationId: assistantMessage?.conversation_id || message.conversation_id || '',
          role: 'ASSISTANT',
          actionLabel: 'AI回复',
          content: assistantContent,
          contentType: assistantMessage?.content_type || 'TEXT',
          messageTimestamp: formatDbDisplayDateTimeLoose(assistantReplyTimes.get(key) || assistantMessage?.message_timestamp || message.message_timestamp)
        }] : []),
        ...actionEvents
      ];
    });
}

function dbMessageFriendNick(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nick = String(messages[index]?.channel_friend_nick ?? messages[index]?.friend_nick ?? '').trim();
    if (nick) return nick;
  }
  return '';
}

function buildDbConversationRows({ conversations = [], messages = [], executions = [] }) {
  const groups = new Map();
  conversations.forEach(item => {
    const workflowId = String(item.workflow_id ?? item.workflowId ?? '');
    const conversationId = String(item.conversation_id ?? item.conversationId ?? '');
    if (!workflowId || !conversationId) return;
    const key = dbKey(workflowId, conversationId);
    const existing = groups.get(key) || {
      id: `${workflowId}:${conversationId}`,
      workflowId,
      conversationId,
      status: item.status || '',
      friendNick: item.friend_nick,
      lastMessageAt: item.last_message_at || item.lastMessageAt || '',
      messages: [],
      executions: []
    };
    if (String(item.last_message_at || '').localeCompare(existing.lastMessageAt || '') > 0) existing.lastMessageAt = item.last_message_at;
    existing.status ||= item.status || '';
    groups.set(key, existing);
  });

  messages.forEach(message => {
    const workflowId = String(message.workflow_id ?? message.workflowId ?? '');
    const conversationId = String(message.conversation_id ?? message.conversationId ?? '');
    const group = groups.get(dbKey(workflowId, conversationId));
    if (!group) return;
    group.messages.push(message);
    const timestamp = String(message.message_timestamp || message.messageTimestamp || '');
    if (timestamp.localeCompare(group.lastMessageAt || '') > 0) group.lastMessageAt = timestamp;
  });

  const triggerToGroup = new Map();
  groups.forEach(group => {
    group.messages.forEach(message => {
      const triggerId = dbTriggerIdOf(message);
      if (triggerId) triggerToGroup.set(`${group.workflowId}\n${triggerId}`, group);
    });
  });

  executions.forEach(execution => {
    const workflowId = dbWorkflowIdOf(execution);
    const triggerId = dbTriggerIdOf(execution);
    const group = triggerToGroup.get(`${workflowId}\n${triggerId}`);
    if (group) group.executions.push(execution);
  });

  return [...groups.values()].sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''))).map(group => {
    const sortedMessages = [...group.messages].sort((a, b) => String(a.message_timestamp || '').localeCompare(String(b.message_timestamp || '')));
    const triggerInputs = dbTriggerInputMap(group.executions);
    const emptyAssistantReplies = new Map();
    const triggerMeta = dbTriggerMetaMap(group.executions);
    const errors = group.executions.filter(executionHasError);
    return {
      id: group.id,
      workflowId: group.workflowId,
      conversationId: group.conversationId,
      status: group.status,
      lastMessageAt: formatDbDisplayDateTimeLoose(group.lastMessageAt),
      messageCount: group.messages.length,
      userMessageCount: group.messages.filter(message => String(message.role || '').toUpperCase() === 'USER').length,
      assistantMessageCount: group.messages.filter(message => String(message.role || '').toUpperCase() === 'ASSISTANT').length,
      friendNick: group.friendNick ?? (dbConversationFriendNick(group.executions) || dbMessageFriendNick(sortedMessages)),
      messageSummary: sortedMessages
        .filter(message => String(message.role || '').toUpperCase() === 'USER')
        .map(message => {
          const meta = triggerMeta.get(dbTriggerKeyOf(message));
          if (Number(meta?.conversationType) === 3) return String(meta?.eventContent || '');
          return dbMessageDisplayContent(message, triggerInputs, emptyAssistantReplies);
        })
        .filter(value => value !== undefined && value !== ''),
      hasError: errors.length > 0,
      errorSummary: errors.map(item => item.error_message || item.error_class || item.error_code || item.status).filter(Boolean)[0] || ''
    };
  });
}

function normalizeDbExecution(execution, preview = {}, { includeDetails = false } = {}) {
  const normalized = {
    id: execution.id,
    triggerMessageId: dbTriggerIdOf(execution),
    workflowId: dbWorkflowIdOf(execution),
    runId: execution.temporal_workflow_id ?? execution.temporalWorkflowId ?? execution.run_id ?? execution.runId ?? '',
    nodeId: execution.node_id ?? execution.nodeId ?? '',
    nodeType: execution.node_type ?? execution.nodeType ?? '',
    nodeName: execution.node_name ?? execution.nodeName ?? '',
    status: execution.status || '',
    errorMessage: execution.error_message || '',
    errorClass: execution.error_class || '',
    errorCode: execution.error_code || '',
    logs: parseDbJson(execution.logs, execution.logs || null),
    beforeSnapshot: parseDbJson(execution.before_snapshot, execution.before_snapshot || null),
    afterSnapshot: parseDbJson(execution.after_snapshot, execution.after_snapshot || null),
    startedAt: formatDbDisplayDateTimeLoose(execution.started_at),
    completedAt: formatDbDisplayDateTimeLoose(execution.completed_at),
    durationMs: Number(execution.duration_ms || 0),
    previewContent: preview.content ?? '',
    previewLabel: preview.label || '',
    previewOutputs: parseDbJson(execution.outputs, execution.outputs || null),
    detailsLoaded: includeDetails
  };
  if (includeDetails) {
    normalized.inputs = parseDbJson(execution.inputs, execution.inputs || null);
    normalized.outputs = parseDbJson(execution.outputs, execution.outputs || null);
    normalized.logs = parseDbJson(execution.logs, execution.logs || null);
    normalized.beforeSnapshot = parseDbJson(execution.before_snapshot, execution.before_snapshot || null);
    normalized.afterSnapshot = parseDbJson(execution.after_snapshot, execution.after_snapshot || null);
  }
  return normalized;
}

function normalizeDbConversationVariables(variables = []) {
  return [...variables]
    .sort((a, b) => String(a.variable_key || '').localeCompare(String(b.variable_key || '')))
    .map(item => ({
      key: item.variable_key || '',
      value: parseDbJson(item.variable_value, item.variable_value || ''),
      type: item.variable_type || '',
      description: item.variable_description || item.description || ''
    }));
}

function dbGraphNodeType(node) {
  return String(node?.type || node?.nodeType || node?.data?.nodeType || '');
}

function dbGraphNodeLabel(node) {
  return String(node?.data?.label || node?.label || node?.id || '');
}

function dbGraphTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value || '');
}

function dbHistoricalSnapshotForExecutions(executions, snapshots) {
  const executionNodeIds = new Set(executions.map(dbNodeIdOf).filter(Boolean));
  const firstStartedAt = executions.map(item => dbGraphTimestamp(item.started_at)).filter(Boolean).sort()[0] || '';
  const candidates = snapshots.map(snapshot => {
    const nodeIds = new Set((snapshot.graph.nodes || []).map(node => String(node.id)));
    return {
      ...snapshot,
      matchedCount: [...executionNodeIds].filter(id => nodeIds.has(id)).length,
      publishedBeforeRun: !firstStartedAt || !snapshot.createdAt || snapshot.createdAt <= firstStartedAt
    };
  }).filter(snapshot => snapshot.matchedCount > 0);
  if (!candidates.length) return null;
  const preferredCandidates = candidates.some(snapshot => snapshot.publishedBeforeRun)
    ? candidates.filter(snapshot => snapshot.publishedBeforeRun)
    : candidates;
  const maxMatchedCount = Math.max(...preferredCandidates.map(snapshot => snapshot.matchedCount));
  return preferredCandidates
    .filter(snapshot => snapshot.matchedCount === maxMatchedCount)
    .sort((left, right) => {
      return left.publishedBeforeRun
        ? String(right.createdAt).localeCompare(String(left.createdAt))
        : String(left.createdAt).localeCompare(String(right.createdAt));
    })[0];
}

function dbHistoricalNodeState(node, currentNodes) {
  const historicType = dbGraphNodeType(node);
  const historicLabel = dbGraphNodeLabel(node).replace(/\s+/g, '').toLowerCase();
  const matchedCurrentNode = currentNodes.find(currentNode => {
    if (dbGraphNodeType(currentNode) !== historicType) return false;
    const currentLabel = dbGraphNodeLabel(currentNode).replace(/\s+/g, '').toLowerCase();
    return historicLabel && currentLabel && (historicLabel === currentLabel || historicLabel.includes(currentLabel) || currentLabel.includes(historicLabel));
  });
  return {
    state: matchedCurrentNode ? 'modified' : 'deleted',
    currentNodeId: matchedCurrentNode?.id || ''
  };
}

function dbHistoricalNodesByTrigger({ currentGraph, workflowVersions, executions }) {
  const currentNodes = currentGraph.nodes || [];
  const currentNodeIds = new Set(currentNodes.map(node => String(node.id)));
  const snapshots = workflowVersions.map(version => ({
    id: String(version.id || ''),
    publishVersion: Number(version.publish_version || 0),
    createdAt: dbGraphTimestamp(version.created_at),
    graph: parseDbJson(version.graph_snapshot, { nodes: [], edges: [] }) || { nodes: [], edges: [] }
  })).filter(snapshot => Array.isArray(snapshot.graph.nodes));
  if (!snapshots.length) return {};
  const executionsByTrigger = new Map();
  executions.forEach(execution => {
    const triggerId = dbTriggerIdOf(execution);
    if (!triggerId) return;
    if (!executionsByTrigger.has(triggerId)) executionsByTrigger.set(triggerId, []);
    executionsByTrigger.get(triggerId).push(execution);
  });
  const result = {};
  executionsByTrigger.forEach((triggerExecutions, triggerId) => {
    const snapshot = dbHistoricalSnapshotForExecutions(triggerExecutions, snapshots);
    if (!snapshot) return;
    const historicalNodesById = new Map((snapshot.graph.nodes || []).map(node => [String(node.id), node]));
    const missingExecutions = triggerExecutions.filter(execution => !currentNodeIds.has(dbNodeIdOf(execution)));
    if (!missingExecutions.length) return;
    const nodes = missingExecutions.map(execution => {
      const nodeId = dbNodeIdOf(execution);
      const historicalNode = historicalNodesById.get(nodeId) || {
        id: nodeId,
        type: execution.node_type || execution.nodeType || '',
        position: { x: 0, y: 0 },
        data: {
          label: execution.node_name || execution.nodeName || nodeId,
          config: {},
          nodeType: execution.node_type || execution.nodeType || ''
        }
      };
      return {
        id: nodeId,
        node: historicalNode,
        ...dbHistoricalNodeState(historicalNode, currentNodes)
      };
    });
    const visibleNodeIds = new Set([...currentNodeIds, ...nodes.map(node => node.id)]);
    const historicalNodeIds = new Set(nodes.map(node => node.id));
    const edges = (snapshot.graph.edges || [])
      .filter(edge => historicalNodeIds.has(String(edge.source)) || historicalNodeIds.has(String(edge.target)))
      .filter(edge => visibleNodeIds.has(String(edge.source)) && visibleNodeIds.has(String(edge.target)))
      .map(edge => ({
        id: `historical:${edge.id || `${edge.source}-${edge.target}`}`,
        source: String(edge.source),
        target: String(edge.target),
        sourceHandle: edge.sourceHandle || '',
        targetHandle: edge.targetHandle || '',
        label: edge.label || '',
        historical: true
      }));
    result[triggerId] = {
      version: { id: snapshot.id, publishVersion: snapshot.publishVersion },
      nodes,
      edges
    };
  });
  return result;
}

async function dbWorkflowVersionsForHistoricalNodes(client, workflowId, currentGraph, executions) {
  const currentNodeIds = new Set((currentGraph.nodes || []).map(node => String(node.id)));
  const missingNodeIds = [...new Set(executions.map(dbNodeIdOf).filter(nodeId => nodeId && !currentNodeIds.has(nodeId)))];
  if (!missingNodeIds.length) return [];
  const firstStartedAt = executions.map(item => dbGraphTimestamp(item.started_at)).filter(Boolean).sort()[0] || '';
  const queryVersions = async beforeRunOnly => {
    const params = [workflowId, missingNodeIds];
    const beforeRunClause = beforeRunOnly && firstStartedAt
      ? `AND created_at <= $${params.push(firstStartedAt)}::timestamp`
      : '';
    const result = await client.query(`
      SELECT id, publish_version, graph_snapshot, created_at
      FROM public.workflow_version
      WHERE workflow_id = $1
        AND deleted_at IS NULL
        ${beforeRunClause}
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(graph_snapshot->'nodes', '[]'::jsonb)) node
          WHERE node->>'id' = ANY($2::text[])
        )
      ORDER BY created_at DESC
      LIMIT 12
    `, params);
    return result.rows;
  };
  try {
    const beforeRunVersions = await queryVersions(true);
    return beforeRunVersions.length ? beforeRunVersions : await queryVersions(false);
  } catch (error) {
    return [];
  }
}

function buildDbConversationDetail({ workflow = null, workflowVersions = [], messages = [], variables = [], executions = [] }) {
  const sortedMessages = [...messages].sort((a, b) => String(a.message_timestamp || '').localeCompare(String(b.message_timestamp || '')));
  const triggerInputs = dbTriggerInputMap(executions);
  const assistantReplies = dbAssistantReplyMap(executions);
  const triggerMeta = dbTriggerMetaMap(executions);
  const userMessages = sortedMessages.filter(message => String(message.role || '').toUpperCase() === 'USER' && dbTriggerIdOf(message));
  const selectedTriggerMessageId = dbTriggerIdOf(userMessages.at(-1)) || '';
  const triggerOrder = [];
  sortedMessages.forEach(message => {
    const triggerId = dbTriggerIdOf(message);
    if (String(message.role || '').toUpperCase() === 'USER' && triggerId && !triggerOrder.includes(triggerId)) triggerOrder.push(triggerId);
  });
  executions.forEach(execution => {
    const triggerId = dbTriggerIdOf(execution);
    if (triggerId && !triggerOrder.includes(triggerId)) triggerOrder.push(triggerId);
  });
  const executionsByTrigger = triggerOrder.reduce((result, triggerId) => {
    const triggerExecutions = executions
      .filter(execution => dbTriggerIdOf(execution) === triggerId)
      .sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || '')));
    const executionsByNodeId = new Map(triggerExecutions
      .map(execution => [dbNodeIdOf(execution), execution])
      .filter(([nodeId]) => Boolean(nodeId)));
    result[triggerId] = triggerExecutions.map(execution => {
      const nodeType = String(execution.node_type || execution.nodeType || '');
      const nodeName = String(execution.node_name || execution.nodeName || '');
      const preview = nodeName === '灵犀触发器'
        ? { content: dbTriggerExecutionInput(execution) }
        : nodeType === 'lingxi_send'
          ? dbSendExecutionPreview(execution, executionsByNodeId)
          : {};
      return normalizeDbExecution(execution, preview);
    });
    return result;
  }, {});
  const workflowGraph = parseDbJson(workflow?.graph_json, { nodes: [], edges: [] }) || { nodes: [], edges: [] };
  const terminalNodeIds = dbWorkflowTerminalNodeIds(workflowGraph);
  return {
    workflow: workflow ? {
      id: String(workflow.id || workflow.workflow_id || ''),
      name: workflow.name || '',
      status: workflow.status || '',
      publishVersion: workflow.publish_version || ''
    } : null,
    workflowGraph,
    historicalNodesByTrigger: dbHistoricalNodesByTrigger({ currentGraph: workflowGraph, workflowVersions, executions }),
    friendNick: dbConversationFriendNick(executions) || dbMessageFriendNick(sortedMessages),
    messages: dbConversationDisplayMessages(sortedMessages, executions, triggerInputs, assistantReplies, terminalNodeIds, dbTriggerLatestMsgTimeMap(executions), dbAssistantReplyTimeMap(executions), triggerMeta),
    variables: normalizeDbConversationVariables(variables),
    selectedTriggerMessageId,
    executionsByTrigger
  };
}


function dbTriggerPayload(execution) {
  const inputs = parseDbJson(execution.inputs, null) || {};
  const outputs = parseDbJson(execution.outputs, null) || {};
  return { ...inputs, ...outputs };
}

function extractDbConversationIdentity(triggerExecution) {
  const payload = dbTriggerPayload(triggerExecution);
  const existingRequestId = String(
    payload.requestId
      || payload.eventId
      || payload.event_id
      || payload.trigger_message_id
      || payload._metadata?.event_id
      || payload._metadata?.trigger_message_id
      || triggerExecution.event_id
      || triggerExecution.trigger_message_id
      || ''
  ).trim();
  return {
    weworkCorpId: String(payload.weworkCorpId || ""),
    weworkAccount: String(payload.weworkAccount || ""),
    friendExternalId: String(payload.friendExternalId || ""),
    friendRemoteId: String(payload.friendRemoteId || ""),
    conversationId: String(payload.conversation_id || payload.conversationId || ""),
    existingRequestId,
    agentId: String(payload.agentId || ""),
    lingxiAccount: String(payload.lingxiAccount || ""),
    friendNick: String(payload.friendNick || ""),
    weworkAccountAlias: String(payload.weworkAccountAlias || "")
  };
}

function aggregateDbConversationTagList(firstTriggerExecution, executions) {
  const firstPayload = dbTriggerPayload(firstTriggerExecution);
  const tags = new Set(Array.isArray(firstPayload.tagList) ? firstPayload.tagList : []);
  const executionsByTrigger = new Map();
  executions.forEach(execution => {
    const triggerId = dbTriggerIdOf(execution);
    if (!triggerId) return;
    if (!executionsByTrigger.has(triggerId)) executionsByTrigger.set(triggerId, []);
    executionsByTrigger.get(triggerId).push(execution);
  });
  const tagEvents = [];
  executionsByTrigger.forEach(items => {
    const executionsByNodeId = new Map(items
      .map(execution => [dbNodeIdOf(execution), execution])
      .filter(([nodeId]) => Boolean(nodeId)));
    items.forEach(execution => {
      tagEvents.push(...dbSendExecutionActions(execution, executionsByNodeId));
    });
  });
  tagEvents
    .sort((left, right) => String(left.startedAt || '').localeCompare(String(right.startedAt || '')))
    .forEach(event => {
      const tag = dbInputText(event.content).trim();
      if (!tag) return;
      if (event.tagOperateType === 2) tags.delete(tag);
      else tags.add(tag);
    });
  return [...tags];
}

function buildDbConversationInputList(latestTriggerExecution, executions) {
  const triggerPayload = dbTriggerPayload(latestTriggerExecution);
  const inputList = Array.isArray(triggerPayload.inputList) ? [...triggerPayload.inputList] : [];
  const friendRemoteId = String(triggerPayload.friendRemoteId || '').trim();
  const latestStudentInputs = Array.isArray(triggerPayload.input) ? triggerPayload.input : [triggerPayload.input];
  latestStudentInputs
    .map(dbInputText)
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => {
      const message = friendRemoteId ? `${friendRemoteId}:${value}` : value;
      if (!inputList.includes(message)) inputList.push(message);
    });
  const triggerId = dbTriggerIdOf(latestTriggerExecution);
  const triggerExecutions = executions.filter(execution => dbTriggerIdOf(execution) === triggerId);
  const executionsByNodeId = new Map(triggerExecutions
    .map(execution => [dbNodeIdOf(execution), execution])
    .filter(([nodeId]) => Boolean(nodeId)));
  const lingxiSendExecutions = triggerExecutions
    .filter(execution => String(execution.node_type || execution.nodeType || '') === 'lingxi_send')
    .sort((left, right) => String(left.started_at || '').localeCompare(String(right.started_at || '')));
  for (const execution of lingxiSendExecutions.reverse()) {
    const aiReply = dbSendExecutionContent(execution, executionsByNodeId);
    if (!aiReply.found || !aiReply.value) continue;
    const teacherId = String(triggerPayload.teacherId || triggerPayload.teacher_id || triggerPayload.lingxiAccount || '').trim()
      || inputList.slice().reverse().map(item => String(item).split(':', 1)[0]).find(prefix => prefix && prefix !== friendRemoteId)
      || 'mqSender';
    const message = `${teacherId}:${aiReply.value}`;
    if (!inputList.includes(message)) inputList.push(message);
    break;
  }
  return inputList;
}

// Prepare full payload for sending DB conversation message
function prepareDbConversationPayload({
  workflowId,
  conversationId,
  message,
  executions,
  agentId,
  mqConfigId
}) {
  // Sort executions by time
  const sortedExecutions = [...executions].sort((a, b) => 
    String(a.started_at || "").localeCompare(String(b.started_at || ""))
  );
  
  // Find trigger executions
  const triggerExecutions = sortedExecutions.filter(e => {
    const nodeType = String(e.node_type || e.nodeType || "");
    const nodeName = String(e.node_name || e.nodeName || "");
    return nodeType === "lingxi_trigger" || nodeName === "灵犀触发器";
  });
  
  if (!triggerExecutions.length) {
    throw new Error("未找到触发器执行记录");
  }
  
  // Get latest trigger for identity and inputList
  const latestTrigger = triggerExecutions.at(-1);
  const identity = extractDbConversationIdentity(latestTrigger);
  
  // Get first trigger for initial tagList
  const firstTrigger = triggerExecutions[0];
  const tagList = aggregateDbConversationTagList(firstTrigger, sortedExecutions);
  
  // Build inputList
  const inputList = buildDbConversationInputList(latestTrigger, sortedExecutions);
  
  // Build payload
  const now = nowIsoLocal();
  const requestId = conversationRequestId(identity);
  const payload = {
    requestId,
    input: [message],
    inputList,
    latestMsgTime: now,
    weworkCorpId: identity.weworkCorpId,
    agentId: agentId || identity.agentId || loadConfig().defaultAgentId,
    addTime: now,
    weworkAccount: identity.weworkAccount,
    friendNick: identity.friendNick || randomNick(),
    friendExternalId: identity.friendExternalId,
    tagList,
    weworkAccountAlias: identity.weworkAccountAlias || loadConfig().defaultAlias,
    friendRemoteId: identity.friendRemoteId,
    lingxiAccount: identity.lingxiAccount || "mqSender",
    conversation_id: identity.conversationId || conversationId,
    eventId: requestId,
    trigger_message_id: requestId,
    user_input: message
  };
  // 后续消息与初始测试消息使用相同的协议字段：当前学生消息写入
  // inputMessageList，历史消息按 inputList 的 RemoteId 生成 inputListMessageList。
  // 保留最近一次触发器中的时间和消息类型，缺失时由同步方法回退为当前时间和文本类型。
  const latestTriggerPayload = dbTriggerPayload(latestTrigger);
  synchronizeProtocolMessageLists(payload, latestTriggerPayload.inputListMessageList);
  return payload;
}
async function testDbConnection(configId) {
  return withDbClientQueue(async () => {
    const config = dbConfig(configId);
    const fingerprint = dbConnectionFingerprint(config);
    const { Pool } = requirePg();
    const pool = dbPoolForConfig(Pool, config, fingerprint);
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      return { ok: true };
    } catch (err) {
      throw normalizeDbConnectionError(err);
    } finally {
      await pool.end().catch(() => {});
    }
  });
}

async function connectDbConnection(configId) {
  return withDbClientQueue(async () => {
    const config = dbConfig(configId);
    const fingerprint = dbConnectionFingerprint(config);
    if (dbPool && dbPoolFingerprint === fingerprint && dbConnectionStatus(config.id).status === 'connected') {
      return dbConnectionStatus(config.id);
    }
    const { Pool } = requirePg();
    const candidatePool = dbPoolForConfig(Pool, config, fingerprint);
    try {
      const client = await candidatePool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    } catch (err) {
      await candidatePool.end().catch(() => {});
      if (!dbPool) setDbConnectionState(config, 'error', normalizeDbConnectionError(err).message);
      throw normalizeDbConnectionError(err);
    }

    const previousPool = dbPool;
    dbPool = candidatePool;
    dbPoolFingerprint = fingerprint;
    clearDbConversationCandidateCache();
    setDbConnectionState(config, 'connected');
    if (previousPool) await previousPool.end().catch(() => {});
    return dbConnectionStatus(config.id);
  });
}

async function disconnectDbConnection(configId) {
  return withDbClientQueue(async () => {
    const config = dbConfig(configId);
    const fingerprint = dbConnectionFingerprint(config);
    clearDbConversationCandidateCache();
    if (dbPool && dbPoolFingerprint === fingerprint) {
      const pool = dbPool;
      dbPool = null;
      dbPoolFingerprint = '';
      await pool.end();
      setDbConnectionState(config, 'disconnected');
    }
    return dbConnectionStatus(config.id);
  });
}

const DB_CONVERSATION_CACHE_TTL_MS = 5 * 60 * 1000;
const DB_CONVERSATION_CACHE_MAX_ENTRIES = 20;
const dbConversationCandidateCache = new Map();

function clearDbConversationCandidateCache() {
  dbConversationCandidateCache.clear();
}

function getDbConversationCandidateCache(cacheKey) {
  const entry = dbConversationCandidateCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DB_CONVERSATION_CACHE_TTL_MS) {
    dbConversationCandidateCache.delete(cacheKey);
    return null;
  }
  // Refresh LRU order
  dbConversationCandidateCache.delete(cacheKey);
  dbConversationCandidateCache.set(cacheKey, entry);
  return entry;
}

function setDbConversationCandidateCache(cacheKey, allCandidates) {
  if (dbConversationCandidateCache.has(cacheKey)) {
    dbConversationCandidateCache.delete(cacheKey);
  } else if (dbConversationCandidateCache.size >= DB_CONVERSATION_CACHE_MAX_ENTRIES) {
    const oldestKey = dbConversationCandidateCache.keys().next().value;
    if (oldestKey !== undefined) dbConversationCandidateCache.delete(oldestKey);
  }
  const entry = {
    createdAt: Date.now(),
    allCandidates: Array.isArray(allCandidates) ? allCandidates : [],
    pageItems: new Map()
  };
  dbConversationCandidateCache.set(cacheKey, entry);
  return entry;
}

function dbDateParam(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!text) return null;
  // 兼容旧版只传日期的请求，结束日期包含当天最后一秒。
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text} ${endOfDay ? '23:59:59' : '00:00:00'}`;
  }
  return text;
}

function dbDateRangeTimestamp(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return Number.NaN;
  const timestamp = Date.parse(text.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(timestamp)) return Number.NaN;
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ') === text ? timestamp : Number.NaN;
}

async function listDbConversations(url) {
  const configId = url.searchParams.get('configId') || '';
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  if (!workflowId) {
    const err = new Error('工作流ID为必填项');
    err.statusCode = 400;
    throw err;
  }
  const conversationId = String(url.searchParams.get('conversationId') || '').trim();
  const friendNick = String(url.searchParams.get('friendNick') || '').trim();
  const keyword = String(url.searchParams.get('keyword') || '').trim();
  const hasError = String(url.searchParams.get('hasError') || '').trim();
  const startTime = dbDateParam(url.searchParams.get('startTime'));
  const endTime = dbDateParam(url.searchParams.get('endTime'), true);
  if (!startTime || !endTime) {
    const err = new Error('学员消息时间为必填项');
    err.statusCode = 400;
    throw err;
  }
  const startDay = dbDateRangeTimestamp(startTime);
  const endDay = dbDateRangeTimestamp(endTime);
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) {
    const err = new Error('学员消息时间无效');
    err.statusCode = 400;
    throw err;
  }
  if ((endDay + 1000 - startDay) / 86400000 > 7) {
    const err = new Error('学员消息时间最多7天');
    err.statusCode = 400;
    throw err;
  }
  const pageNo = Math.max(1, Number(url.searchParams.get('pageNo') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
  const forceRefresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true';
  // 先按必填的工作流和时间范围聚合候选会话，避免在每个可选筛选条件中重复计算最新消息时间。
  // 界面结束时间包含整秒，用下一秒的排他上界覆盖毫秒数据，保持时间列可用索引。
  const endExclusive = new Date(endDay + 1000).toISOString().slice(0, 19).replace('T', ' ');
  const config = dbConfig(configId);
  const fingerprint = dbConnectionFingerprint(config);
  const connection = dbConnectionStatus(config.id);
  if (!dbPool || dbPoolFingerprint !== fingerprint || connection.status !== 'connected') {
    const error = new Error('数据库未连接，请先点击“建立连接”后再查询');
    error.statusCode = 409;
    throw error;
  }
  const cacheKey = JSON.stringify([config.id, fingerprint, workflowId, startTime, endExclusive, conversationId, friendNick, keyword, hasError]);
  const pageCacheKey = `${pageNo}:${pageSize}`;
  let cachedEntry = forceRefresh ? null : getDbConversationCandidateCache(cacheKey);
  if (cachedEntry && cachedEntry.pageItems.has(pageCacheKey)) {
    return {
      items: cachedEntry.pageItems.get(pageCacheKey),
      total: cachedEntry.allCandidates.length,
      pageNo,
      pageSize
    };
  }

  return withDbClient(configId, async client => {
    if (!cachedEntry) {
      const params = [workflowId, startTime, endExclusive];
      const where = [];
      let activeConversationIdClause = '';
      if (conversationId) {
        params.push(`%${conversationId}%`);
        activeConversationIdClause = `AND m.conversation_id ILIKE $${params.length}`;
        where.push(`candidate.conversation_id ILIKE $${params.length}`);
      }
      // 昵称优先读取触发器身份字段，新架构下触发器节点快照为空时回退读取 channel_messages.raw_data。
      const nicknameJoin = friendNick ? `JOIN LATERAL (
        SELECT nick.friend_nick
        FROM (
          SELECT m.event_id
          FROM public.conversation_messages m
          WHERE m.workflow_id = candidate.workflow_id
            AND m.conversation_id = candidate.conversation_id
            AND m.deleted_at IS NULL
          ORDER BY m.message_timestamp DESC NULLS LAST, m.id DESC
          OFFSET 0
        ) recent
        JOIN LATERAL (
          SELECT COALESCE(
            (
              SELECT COALESCE(NULLIF(BTRIM(e.outputs::jsonb ->> 'friendNick'), ''),
                              NULLIF(BTRIM(e.inputs::jsonb ->> 'friendNick'), ''))
              FROM public.workflow_node_executions e
              WHERE e.workflow_id = candidate.workflow_id
                AND e.event_id = (recent.event_id COLLATE "default")
                AND e.deleted_at IS NULL
                AND (e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器')
                AND COALESCE(NULLIF(BTRIM(e.outputs::jsonb ->> 'friendNick'), ''),
                             NULLIF(BTRIM(e.inputs::jsonb ->> 'friendNick'), '')) IS NOT NULL
              ORDER BY e.id DESC
              LIMIT 1
            ),
            (
              SELECT NULLIF(BTRIM(cm.raw_data ->> 'friendNick'), '')
              FROM public.channel_messages cm
              WHERE cm.event_id = (recent.event_id COLLATE "default")
                AND cm.deleted_at IS NULL
                AND NULLIF(BTRIM(cm.raw_data ->> 'friendNick'), '') IS NOT NULL
              ORDER BY cm.id DESC
              LIMIT 1
            )
          ) AS friend_nick
        ) nick ON nick.friend_nick IS NOT NULL
        LIMIT 1
      ) nickname ON TRUE` : '';
      if (friendNick) {
        // 用户输入的 % 和 _ 按昵称字符处理，避免被解释为 SQL 通配符。
        params.push(`%${friendNick.replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`nickname.friend_nick ILIKE $${params.length}`);
      }
      if (keyword) {
        params.push(`%${keyword}%`);
        where.push(`EXISTS (
          SELECT 1 FROM public.conversation_messages m
          WHERE m.workflow_id = candidate.workflow_id
            AND m.conversation_id = candidate.conversation_id
            AND m.deleted_at IS NULL
            AND (
              (
                UPPER(COALESCE(m.role, '')) = 'USER'
                AND (
                  m.content ILIKE $${params.length}
                  OR EXISTS (
                    SELECT 1
                    FROM public.channel_messages cm
                    WHERE cm.event_id = (m.event_id COLLATE "default")
                      AND cm.deleted_at IS NULL
                      AND (
                        (cm.raw_data -> 'input')::text ILIKE $${params.length}
                        OR COALESCE(cm.raw_data ->> 'eventContent', '') ILIKE $${params.length}
                      )
                  )
                )
              )
              OR (
                UPPER(COALESCE(m.role, '')) = 'ASSISTANT'
                AND EXISTS (
                  SELECT 1
                  FROM public.workflow_node_executions send
                  WHERE send.workflow_id = m.workflow_id
                    AND send.event_id = (m.event_id COLLATE "default")
                    AND send.deleted_at IS NULL
                    AND send.node_type = 'lingxi_send'
                    AND send.inputs::text ILIKE '%actionType%'
                    AND send.inputs::text ILIKE '%actionContent%'
                    AND send.inputs::text ILIKE '%6%'
                )
                AND EXISTS (
                  SELECT 1
                  FROM public.workflow_node_executions e
                  WHERE e.workflow_id = m.workflow_id
                    AND e.event_id = (m.event_id COLLATE "default")
                    AND e.deleted_at IS NULL
                    AND (
                      e.inputs::text ILIKE $${params.length}
                      OR e.outputs::text ILIKE $${params.length}
                    )
                )
              )
              OR (
                UPPER(COALESCE(m.role, '')) = 'ASSISTANT'
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.workflow_node_executions send
                  WHERE send.workflow_id = m.workflow_id
                    AND send.event_id = (m.event_id COLLATE "default")
                    AND send.deleted_at IS NULL
                    AND send.node_type = 'lingxi_send'
                    AND send.inputs::text ILIKE '%actionType%'
                    AND send.inputs::text ILIKE '%actionContent%'
                    AND send.inputs::text ILIKE '%6%'
                )
                AND m.content ILIKE $${params.length}
              )
              OR (
                UPPER(COALESCE(m.role, '')) NOT IN ('USER', 'ASSISTANT')
                AND m.content ILIKE $${params.length}
              )
            )
        )`);
      }
      if (hasError === 'true') {
        where.push(`EXISTS (
          SELECT 1
          FROM public.conversation_messages m
          JOIN public.workflow_node_executions e
           ON e.workflow_id = m.workflow_id
           AND e.event_id = (m.event_id COLLATE "default")
           AND e.deleted_at IS NULL
          WHERE m.workflow_id = candidate.workflow_id
            AND m.conversation_id = candidate.conversation_id
            AND m.deleted_at IS NULL
            AND (
              COALESCE(e.error_message, '') <> ''
              OR COALESCE(e.error_class, '') <> ''
              OR COALESCE(e.error_code, '') <> ''
              OR UPPER(COALESCE(e.status, '')) NOT IN ('SUCCESS', 'COMPLETED')
            )
        )`);
      } else if (hasError === 'false') {
        where.push(`NOT EXISTS (
          SELECT 1
          FROM public.conversation_messages m
          JOIN public.workflow_node_executions e
           ON e.workflow_id = m.workflow_id
           AND e.event_id = (m.event_id COLLATE "default")
           AND e.deleted_at IS NULL
          WHERE m.workflow_id = candidate.workflow_id
            AND m.conversation_id = candidate.conversation_id
            AND m.deleted_at IS NULL
            AND (
              COALESCE(e.error_message, '') <> ''
              OR COALESCE(e.error_class, '') <> ''
              OR COALESCE(e.error_code, '') <> ''
              OR UPPER(COALESCE(e.status, '')) NOT IN ('SUCCESS', 'COMPLETED')
            )
        )`);
      }
      // 以学员消息确定候选会话；关联 workflow_instance 主运行实例读取状态与最新信号时间，排除明确软删除的会话。
      // 最近消息时间仅用于排序，不再决定会话是否入选。
      const conversationSql = `WITH active_conversations AS MATERIALIZED (
          SELECT m.workflow_id,
                 m.conversation_id,
                 MAX(m.message_timestamp) AS window_last_user_at
          FROM public.conversation_messages m
          WHERE m.workflow_id = $1
            AND m.deleted_at IS NULL
            AND UPPER(COALESCE(m.role, '')) = 'USER'
            AND m.message_timestamp >= $2 AND m.message_timestamp < $3
            ${activeConversationIdClause}
          GROUP BY m.workflow_id, m.conversation_id
        ), candidates AS MATERIALIZED (
          SELECT active.workflow_id,
                 active.conversation_id,
                 wi.status,
                 COALESCE(
                   GREATEST(active.window_last_user_at, wi.last_signal_at),
                   active.window_last_user_at,
                   wi.last_signal_at
                 ) AS last_message_at
          FROM active_conversations active
          LEFT JOIN LATERAL (
            SELECT i.status,
                   i.last_signal_at,
                   i.deleted_at
            FROM public.workflow_instance i
            WHERE i.workflow_id = active.workflow_id
              AND i.conversation_id = active.conversation_id
              AND i.entry_type = 'MAIN'
            ORDER BY i.id DESC
            LIMIT 1
          ) wi ON TRUE
          WHERE wi.deleted_at IS NULL
        ), filtered AS (
          SELECT candidate.*${friendNick ? ', nickname.friend_nick' : ''}
          FROM candidates candidate
          ${nicknameJoin}
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        )
        SELECT workflow_id,
               conversation_id,
               status,
               last_message_at${friendNick ? ', friend_nick' : ''}
        FROM filtered
        ORDER BY last_message_at DESC NULLS LAST, workflow_id, conversation_id`;
      const allCandidates = (await client.query(conversationSql, params)).rows;
      cachedEntry = setDbConversationCandidateCache(cacheKey, allCandidates);
    }

    const total = cachedEntry.allCandidates.length;
    const offset = (pageNo - 1) * pageSize;
    const conversations = cachedEntry.allCandidates.slice(offset, offset + pageSize);
    const keys = conversations.map(item => [String(item.workflow_id), item.conversation_id]);
    if (!keys.length) return { items: [], total, pageNo, pageSize };
    const conversationIds = keys.map(([, id]) => id);
    const messages = (await client.query(`
      SELECT m.id,
             m.workflow_id,
             m.conversation_id,
             m.role,
             m.content,
             m.content_type,
             m.message_timestamp,
             m.event_id,
             m.event_id AS trigger_message_id,
             NULLIF(BTRIM(cm.raw_data ->> 'friendNick'), '') AS channel_friend_nick
      FROM public.conversation_messages m
      LEFT JOIN LATERAL (
        SELECT c.raw_data
        FROM public.channel_messages c
        WHERE c.event_id = (m.event_id COLLATE "default")
          AND c.deleted_at IS NULL
        ORDER BY c.id DESC
        LIMIT 1
      ) cm ON TRUE
      WHERE m.workflow_id = $1
        AND m.conversation_id = ANY($2::varchar[])
        AND m.deleted_at IS NULL
      ORDER BY m.message_timestamp ASC NULLS LAST, m.id ASC
    `, [workflowId, conversationIds])).rows;
    const triggerIds = [...new Set(messages.map(dbTriggerIdOf).filter(Boolean))];
    const executions = triggerIds.length ? (await client.query(`
      SELECT e.workflow_id,
             e.event_id,
             e.event_id AS trigger_message_id,
             e.node_id,
             e.node_type,
             e.node_name,
             CASE WHEN e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器'
               THEN jsonb_build_object(
                 'friendNick', e.inputs::jsonb -> 'friendNick',
                 'input', e.inputs::jsonb -> 'input',
                 'inputList', e.inputs::jsonb -> 'inputList',
                 'inputMessageList', e.inputs::jsonb -> 'inputMessageList',
                 'inputListMessageList', e.inputs::jsonb -> 'inputListMessageList'
               )
               ELSE NULL
             END AS inputs,
             CASE WHEN e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器'
               THEN jsonb_build_object(
                 'input', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'input',
                 'friendNick', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'friendNick',
                 'latestMsgTime', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'latestMsgTime',
                 'inputList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputList',
                 'inputMessageList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputMessageList',
                 'inputListMessageList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputListMessageList',
                 'conversationType', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'conversationType',
                 'eventContent', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'eventContent'
               )
               ELSE NULL
             END AS outputs,
             e.status,
             e.error_message,
             e.error_class,
             e.error_code
      FROM public.workflow_node_executions e
      ${DB_TRIGGER_CHANNEL_FALLBACK_JOIN}
      WHERE e.workflow_id = $1
        AND e.event_id = ANY($2::varchar[])
        AND e.deleted_at IS NULL
        AND (
          e.node_type = 'lingxi_trigger'
          OR e.node_name = '灵犀触发器'
          OR COALESCE(BTRIM(e.error_message), '') <> ''
          OR COALESCE(BTRIM(e.error_class), '') <> ''
          OR COALESCE(BTRIM(e.error_code), '') <> ''
          OR (
            COALESCE(BTRIM(e.status), '') <> ''
            AND UPPER(BTRIM(e.status)) NOT IN ('SUCCESS', 'COMPLETED')
          )
        )
    `, [workflowId, triggerIds])).rows : [];
    const items = buildDbConversationRows({ conversations, messages, executions });
    cachedEntry.pageItems.set(pageCacheKey, items);
    return {
      items,
      total,
      pageNo,
      pageSize
    };
  });
}

async function listDbWorkflows(url) {
  const configId = url.searchParams.get('configId') || '';
  return withDbClient(configId, async client => {
    const result = await client.query(`
      SELECT id, name
      FROM public.workflow
      WHERE status = 1
        AND deleted_at IS NULL
      ORDER BY id
    `);
    return result.rows.map(workflow => ({
      id: String(workflow.id || ''),
      name: String(workflow.name || '')
    }));
  });
}

function dbRate(numerator, denominator) {
  const num = Number(numerator || 0);
  const den = Number(denominator || 0);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Number(((num / den) * 100).toFixed(2));
}

function dbPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || !sortedValues.length) return 0;
  if (sortedValues.length === 1) return Math.round(sortedValues[0]);
  const pos = (sortedValues.length - 1) * percentile;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedValues[base + 1] ?? sortedValues[base];
  return Math.round(sortedValues[base] + rest * (next - sortedValues[base]));
}

function dbExtractMatchedBranches(outputValue, branchItems = [], defaultBranchLabel = '默认') {
  const output = parseDbJson(outputValue, outputValue && typeof outputValue === 'object' ? outputValue : null) || {};
  const matched = [];
  const appendMatched = value => {
    if (value === null || value === undefined || value === '' || value === 'null') return;
    if (Array.isArray(value)) {
      value.forEach(appendMatched);
      return;
    }
    if (typeof value === 'object') {
      appendMatched(value.id ?? value.branchId ?? value.label ?? value.name);
      return;
    }
    const raw = String(value).trim();
    if (!raw) return;
    const branch = branchItems.find(item => item.id === raw || item.label === raw || (item.isDefault && raw === 'default'));
    const key = branch ? branch.id : raw === 'default' ? 'default' : raw;
    if (key && !matched.includes(key)) matched.push(key);
  };
  appendMatched(output.matchedBranchInfo);
  appendMatched(output.matchedBranches);
  appendMatched(output.matchedBranch);
  return matched;
}

function aggregateRawWorkflowAnalyticsInput({ messages = [], executions = [] }) {
  const activeMessages = messages.filter(item => String(item?.role || 'USER').toUpperCase() === 'USER');
  const conversationIds = new Set(activeMessages.map(item => String(item.conversation_id ?? item.conversationId ?? '')).filter(Boolean));
  const triggerToConversation = new Map();
  activeMessages.forEach(item => {
    const triggerId = dbTriggerIdOf(item);
    const convId = String(item.conversation_id ?? item.conversationId ?? '');
    if (triggerId && !triggerToConversation.has(triggerId)) {
      triggerToConversation.set(triggerId, convId);
    }
  });
  executions.forEach(item => {
    const triggerId = dbTriggerIdOf(item);
    const convId = String(item.conversation_id ?? item.conversationId ?? '');
    if (triggerId && !triggerToConversation.has(triggerId)) {
      triggerToConversation.set(triggerId, convId);
    }
    if (convId) conversationIds.add(convId);
  });

  const normalizedExecs = executions
    .map((item, idx) => {
      const triggerId = dbTriggerIdOf(item);
      if (!triggerId || !triggerToConversation.has(triggerId)) return null;
      const convId = String(item.conversation_id ?? item.conversationId ?? triggerToConversation.get(triggerId) ?? '');
      const nodeId = String(item.node_id ?? item.nodeId ?? item.node_name ?? item.nodeName ?? 'unknown').trim() || 'unknown';
      const nodeName = String(item.node_name ?? item.nodeName ?? nodeId).trim() || nodeId;
      const nodeType = String(item.node_type ?? item.nodeType ?? 'unknown').trim() || 'unknown';
      const status = String(item.status || '').trim();
      const errorMessage = String(item.error_message ?? item.errorMessage ?? '').trim();
      const errorClass = String(item.error_class ?? item.errorClass ?? '').trim();
      const errorCode = String(item.error_code ?? item.errorCode ?? '').trim();
      const isError = executionHasError(item);
      const inputsText = typeof item.inputs === 'string' ? item.inputs : JSON.stringify(item.inputs || {});
      const isReplySend = Boolean(item.is_reply_send ?? item.isReplySend) || (
        nodeType === 'lingxi_send'
        && /actionType/i.test(inputsText)
        && /actionContent/i.test(inputsText)
        && /6/.test(inputsText)
      );
      const durationMs = Math.max(0, Number(item.duration_ms ?? item.durationMs ?? 0) || 0);
      const startedAt = item.started_at ?? item.startedAt ?? '';
      const completedAt = item.completed_at ?? item.completedAt ?? '';
      const startMs = startedAt ? Date.parse(String(startedAt).replace(' ', 'T')) : Number.NaN;
      const endMs = completedAt
        ? Date.parse(String(completedAt).replace(' ', 'T'))
        : (Number.isFinite(startMs) ? startMs + durationMs : Number.NaN);
      const executionId = String(item.id ?? item.execution_id ?? item.executionId ?? '').trim();
      return {
        idx,
        executionId,
        triggerId,
        convId,
        nodeId,
        nodeName,
        nodeType,
        status,
        errorMessage,
        errorClass,
        errorCode,
        isError,
        isReplySend,
        durationMs,
        startedAt,
        completedAt,
        startMs,
        endMs,
        outputs: item.outputs ?? item.condition_outputs ?? item.condition_output
      };
    })
    .filter(Boolean);

  const executedTriggers = new Set(normalizedExecs.map(e => e.triggerId));
  const repliedTriggers = new Set(normalizedExecs.filter(e => e.isReplySend && !e.isError).map(e => e.triggerId));
  const errorConversations = new Set(normalizedExecs.filter(e => e.isError && e.convId).map(e => e.convId));
  const errorTriggers = new Set(normalizedExecs.filter(e => e.isError).map(e => e.triggerId));
  const errorNodeExecutions = normalizedExecs.filter(e => e.isError).length;

  const overview = {
    total_conversations: conversationIds.size,
    total_triggers: triggerToConversation.size,
    executed_triggers: executedTriggers.size,
    replied_triggers: repliedTriggers.size,
    error_conversations: errorConversations.size,
    error_triggers: errorTriggers.size,
    total_node_executions: normalizedExecs.length,
    error_node_executions: errorNodeExecutions
  };

  const byTrigger = new Map();
  normalizedExecs.forEach(e => {
    if (!byTrigger.has(e.triggerId)) byTrigger.set(e.triggerId, []);
    byTrigger.get(e.triggerId).push(e);
  });

  const e2eSamples = [];
  const replySamples = [];
  byTrigger.forEach((items, triggerId) => {
    const convId = items[0]?.convId || '';
    const triggerStarts = items
      .filter(i => i.nodeType === 'lingxi_trigger' || i.nodeName === '灵犀触发器')
      .map(i => i.startMs)
      .filter(Number.isFinite);
    const allStarts = items.map(i => i.startMs).filter(Number.isFinite);
    const minStart = triggerStarts.length ? Math.min(...triggerStarts) : (allStarts.length ? Math.min(...allStarts) : Number.NaN);
    const allEnds = items.map(i => i.endMs).filter(Number.isFinite);
    const maxEnd = allEnds.length ? Math.max(...allEnds) : Number.NaN;
    const sumDuration = items.reduce((sum, i) => sum + i.durationMs, 0);
    const e2eMs = Number.isFinite(minStart) && Number.isFinite(maxEnd) && maxEnd > minStart
      ? Math.round(maxEnd - minStart)
      : sumDuration;
    e2eSamples.push({ triggerId, convId, ms: e2eMs });

    const replyEnds = items.filter(i => i.isReplySend && !i.isError).map(i => i.endMs).filter(Number.isFinite);
    if (items.some(i => i.isReplySend && !i.isError)) {
      const maxReplyEnd = replyEnds.length ? Math.max(...replyEnds) : Number.NaN;
      const replyMs = Number.isFinite(minStart) && Number.isFinite(maxReplyEnd) && maxReplyEnd >= minStart
        ? Math.round(maxReplyEnd - minStart)
        : sumDuration;
      replySamples.push({ triggerId, convId, ms: replyMs });
    }
  });

  const sortedE2e = [...e2eSamples].sort((a, b) => a.ms - b.ms);
  const slowestE2e = [...e2eSamples].sort((a, b) => b.ms - a.ms)[0] || null;
  const sortedReply = [...replySamples].sort((a, b) => a.ms - b.ms);
  const slowestReply = [...replySamples].sort((a, b) => b.ms - a.ms)[0] || null;

  const latency = {
    e2e_count: e2eSamples.length,
    e2e_avg_ms: e2eSamples.length ? Math.round(e2eSamples.reduce((s, i) => s + i.ms, 0) / e2eSamples.length) : 0,
    e2e_p50_ms: dbPercentile(sortedE2e.map(i => i.ms), 0.5),
    e2e_p95_ms: dbPercentile(sortedE2e.map(i => i.ms), 0.95),
    e2e_max_ms: slowestE2e ? slowestE2e.ms : 0,
    slowest_e2e_conversation_id: slowestE2e?.convId || '',
    slowest_e2e_trigger_id: slowestE2e?.triggerId || '',
    reply_count: replySamples.length,
    reply_avg_ms: replySamples.length ? Math.round(replySamples.reduce((s, i) => s + i.ms, 0) / replySamples.length) : 0,
    reply_p50_ms: dbPercentile(sortedReply.map(i => i.ms), 0.5),
    reply_p95_ms: dbPercentile(sortedReply.map(i => i.ms), 0.95),
    reply_max_ms: slowestReply ? slowestReply.ms : 0,
    slowest_reply_conversation_id: slowestReply?.convId || '',
    slowest_reply_trigger_id: slowestReply?.triggerId || ''
  };

  const byNode = new Map();
  normalizedExecs.forEach(e => {
    if (!byNode.has(e.nodeId)) byNode.set(e.nodeId, []);
    byNode.get(e.nodeId).push(e);
  });

  const nodes = [...byNode.entries()].map(([nodeId, items]) => {
    const latest = items.at(-1);
    const durations = items.map(i => i.durationMs).sort((a, b) => a - b);
    const slowest = [...items].sort((a, b) => b.durationMs - a.durationMs || b.idx - a.idx)[0];
    return {
      node_id: nodeId,
      node_name: latest.nodeName,
      node_type: latest.nodeType,
      execution_count: items.length,
      trigger_count: new Set(items.map(i => i.triggerId)).size,
      conversation_count: new Set(items.map(i => i.convId).filter(Boolean)).size,
      error_count: items.filter(i => i.isError).length,
      avg_duration_ms: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
      p50_duration_ms: dbPercentile(durations, 0.5),
      p95_duration_ms: dbPercentile(durations, 0.95),
      max_duration_ms: slowest ? slowest.durationMs : 0,
      slowest_conversation_id: slowest?.convId || '',
      slowest_trigger_id: slowest?.triggerId || ''
    };
  });

  const conditions = normalizedExecs
    .filter(e => e.nodeType === 'condition')
    .map(e => ({
      node_id: e.nodeId,
      node_name: e.nodeName,
      condition_output: typeof e.outputs === 'string' ? e.outputs : JSON.stringify(e.outputs || {}),
      execution_count: 1,
      trigger_count: 1
    }));

  const conditionTimeStats = normalizedExecs
    .filter(e => e.nodeType === 'condition')
    .map(e => {
      const rawTime = String(e.startedAt || e.completedAt || '').trim();
      const hourMatch = rawTime.match(/^\d{4}-(\d{2}-\d{2})[T\s](\d{2})/);
      const dateMatch = rawTime.match(/^(\d{4}-\d{2}-\d{2})/);
      const timeBucket = hourMatch ? `${hourMatch[1]} ${hourMatch[2]}:00` : (dateMatch ? dateMatch[1] : '未知日期');
      return {
        node_id: e.nodeId,
        time_bucket: timeBucket,
        condition_output: typeof e.outputs === 'string' ? e.outputs : JSON.stringify(e.outputs || {}),
        execution_count: 1,
        trigger_count: 1
      };
    });

  const noReplyStats = [];
  const noReplyOccByType = new Map();
  byTrigger.forEach((items, triggerId) => {
    if (repliedTriggers.has(triggerId)) return;
    const convId = items[0]?.convId || '';
    const hasError = items.some(i => i.isError);
    const condItems = items.filter(i => i.nodeType === 'condition');
    const lastCond = condItems.at(-1);
    const lastItem = items.at(-1);
    const triggerItem = items.find(i => i.nodeType === 'lingxi_trigger' || i.nodeName === '灵犀触发器') || items[0];
    const occurredAt = triggerItem?.startedAt || lastItem?.completedAt || lastItem?.startedAt || '';
    const sumDurationMs = items.reduce((s, i) => s + i.durationMs, 0);
    const reasonType = hasError ? 'error_interrupted' : (lastCond ? 'condition_silent' : 'normal_no_send');
    const condOutputStr = lastCond ? (typeof lastCond.outputs === 'string' ? lastCond.outputs : JSON.stringify(lastCond.outputs || {})) : null;
    if (!noReplyOccByType.has(reasonType)) noReplyOccByType.set(reasonType, []);
    noReplyOccByType.get(reasonType).push({
      conversation_id: convId,
      trigger_id: triggerId,
      occurred_at: occurredAt,
      duration_ms: sumDurationMs,
      last_node_id: lastItem?.nodeId || '',
      last_node_name: lastItem?.nodeName || '',
      last_node_type: lastItem?.nodeType || '',
      cond_node_id: lastCond?.nodeId || '',
      cond_node_name: lastCond?.nodeName || '',
      cond_output: condOutputStr
    });
    noReplyStats.push({
      reason_type: reasonType,
      cond_node_id: lastCond?.nodeId || '',
      cond_node_name: lastCond?.nodeName || '',
      cond_output: condOutputStr,
      trigger_count: 1,
      conversation_count: convId ? 1 : 0,
      sample_conversation_id: convId,
      sample_trigger_id: triggerId
    });
  });
  // Attach occurrences to the first row of each reason_type in noReplyStats
  const attachedReasonTypes = new Set();
  noReplyStats.forEach(row => {
    if (!attachedReasonTypes.has(row.reason_type)) {
      attachedReasonTypes.add(row.reason_type);
      row.occurrences = noReplyOccByType.get(row.reason_type) || [];
    }
  });

  const dailyMap = new Map();
  activeMessages.forEach(msg => {
    const triggerId = dbTriggerIdOf(msg);
    if (!triggerId) return;
    const convId = String(msg.conversation_id ?? msg.conversationId ?? '');
    const rawTs = String(msg.message_timestamp ?? msg.messageTimestamp ?? '').trim();
    const dateMatch = rawTs.match(/^(\d{4}-\d{2}-\d{2})/);
    let dayStr = dateMatch ? dateMatch[1] : '';
    if (!dayStr && rawTs) {
      const d = new Date(rawTs.replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) {
        dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    if (!dayStr) return;
    if (!dailyMap.has(dayStr)) {
      dailyMap.set(dayStr, {
        day_date: dayStr,
        convs: new Set(),
        errorConvs: new Set(),
        trigger_count: 0,
        replied_count: 0,
        error_trigger_count: 0
      });
    }
    const entry = dailyMap.get(dayStr);
    if (convId) entry.convs.add(convId);
    entry.trigger_count += 1;
    if (repliedTriggers.has(triggerId)) entry.replied_count += 1;
    if (errorTriggers.has(triggerId)) {
      entry.error_trigger_count += 1;
      if (convId) entry.errorConvs.add(convId);
    }
  });
  const dailyTrend = [...dailyMap.values()]
    .sort((a, b) => a.day_date.localeCompare(b.day_date))
    .map(item => ({
      day_date: item.day_date,
      conversation_count: item.convs.size,
      trigger_count: item.trigger_count,
      replied_count: item.replied_count,
      error_trigger_count: item.error_trigger_count,
      error_conversation_count: item.errorConvs.size
    }));

  const convTurnMap = new Map();
  triggerToConversation.forEach((convId, triggerId) => {
    if (!convId) return;
    if (!convTurnMap.has(convId)) convTurnMap.set(convId, []);
    convTurnMap.get(convId).push(triggerId);
  });
  const convTurnEntries = [...convTurnMap.entries()].map(([convId, tIds]) => ({
    convId,
    turnCount: tIds.length,
    latestTriggerId: tIds.at(-1) || ''
  })).sort((a, b) => b.turnCount - a.turnCount);
  const totalConvsForDepth = convTurnEntries.length;
  const convDepth = {
    total_convs: totalConvsForDepth,
    avg_turns: totalConvsForDepth ? Number((convTurnEntries.reduce((s, c) => s + c.turnCount, 0) / totalConvsForDepth).toFixed(1)) : 0,
    max_turns: convTurnEntries[0]?.turnCount || 0,
    turns_1: convTurnEntries.filter(c => c.turnCount === 1).length,
    turns_2_3: convTurnEntries.filter(c => c.turnCount >= 2 && c.turnCount <= 3).length,
    turns_4_6: convTurnEntries.filter(c => c.turnCount >= 4 && c.turnCount <= 6).length,
    turns_7_plus: convTurnEntries.filter(c => c.turnCount >= 7).length,
    top_conversation_id: convTurnEntries[0]?.convId || '',
    top_trigger_id: convTurnEntries[0]?.latestTriggerId || ''
  };

  const hourlyMap = new Map();
  activeMessages.forEach(msg => {
    const triggerId = dbTriggerIdOf(msg);
    if (!triggerId) return;
    const rawTs = String(msg.message_timestamp ?? msg.messageTimestamp ?? '').trim();
    const d = rawTs ? new Date(rawTs.replace(' ', 'T')) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    const hr = d.getHours();
    if (!hourlyMap.has(hr)) hourlyMap.set(hr, { hour_of_day: hr, trigger_count: 0, replied_count: 0, error_count: 0 });
    const entry = hourlyMap.get(hr);
    entry.trigger_count += 1;
    if (repliedTriggers.has(triggerId)) entry.replied_count += 1;
    if (errorTriggers.has(triggerId)) entry.error_count += 1;
  });
  const hourlyActivity = [...hourlyMap.values()].sort((a, b) => a.hour_of_day - b.hour_of_day);

  const errorMap = new Map();
  normalizedExecs.filter(e => e.isError).forEach(e => {
    const msg = e.errorMessage.slice(0, 300);
    const key = `${e.nodeId}\n${e.status}\n${e.errorCode}\n${e.errorClass}\n${msg}`;
    if (!errorMap.has(key)) {
      errorMap.set(key, {
        node_id: e.nodeId,
        node_name: e.nodeName,
        node_type: e.nodeType,
        status: e.status,
        error_code: e.errorCode,
        error_class: e.errorClass,
        error_message: msg,
        items: []
      });
    }
    errorMap.get(key).items.push(e);
  });

  const errors = [...errorMap.values()].map(group => {
    const sortedItems = [...group.items].sort((a, b) => {
      const aMs = Number.isFinite(a.endMs) ? a.endMs : (Number.isFinite(a.startMs) ? a.startMs : -Infinity);
      const bMs = Number.isFinite(b.endMs) ? b.endMs : (Number.isFinite(b.startMs) ? b.startMs : -Infinity);
      if (bMs !== aMs) return bMs - aMs;
      return b.idx - a.idx;
    });
    const latest = sortedItems[0] || group.items.at(-1);
    return {
      node_id: group.node_id,
      node_name: group.node_name,
      node_type: group.node_type,
      status: group.status,
      error_code: group.error_code,
      error_class: group.error_class,
      error_message: group.error_message,
      error_count: group.items.length,
      trigger_count: new Set(group.items.map(i => i.triggerId)).size,
      conversation_count: new Set(group.items.map(i => i.convId).filter(Boolean)).size,
      last_occurred_at: latest?.completedAt || latest?.startedAt || '',
      sample_conversation_id: latest?.convId || '',
      sample_trigger_id: latest?.triggerId || '',
      occurrences: sortedItems.map(item => ({
        execution_id: item.executionId || '',
        conversation_id: item.convId || '',
        trigger_id: item.triggerId || '',
        occurred_at: item.completedAt || item.startedAt || '',
        duration_ms: item.durationMs || 0,
        error_message: item.errorMessage.slice(0, 500)
      }))
    };
  }).sort((a, b) => b.error_count - a.error_count);

  return { overview, latency, nodes, conditions, conditionTimeStats, noReplyStats, convDepth, hourlyActivity, dailyTrend, errors };
}

function buildDbWorkflowAnalytics({
  workflow = null,
  startTime = '',
  endTime = '',
  overview = null,
  latency = null,
  nodes = null,
  conditions = null,
  conditionTimeStats = null,
  noReplyStats = null,
  convDepth = null,
  hourlyActivity = null,
  dailyTrend = null,
  errors = null,
  messages = [],
  executions = []
} = {}) {
  const aggregated = overview
    ? {
        overview: overview || {},
        latency: latency || {},
        nodes: nodes || [],
        conditions: conditions || [],
        conditionTimeStats: conditionTimeStats || [],
        noReplyStats: noReplyStats || [],
        convDepth: convDepth || {},
        hourlyActivity: hourlyActivity || [],
        dailyTrend: dailyTrend || [],
        errors: errors || []
      }
    : aggregateRawWorkflowAnalyticsInput({ messages, executions });

  const ov = aggregated.overview || {};
  const lat = aggregated.latency || {};
  const nodeRows = Array.isArray(aggregated.nodes) ? aggregated.nodes : [];
  const conditionRows = Array.isArray(aggregated.conditions) ? aggregated.conditions : [];
  const conditionTimeRows = Array.isArray(aggregated.conditionTimeStats) ? aggregated.conditionTimeStats : [];
  const noReplyRows = Array.isArray(aggregated.noReplyStats) ? aggregated.noReplyStats : [];
  const convDepthRow = aggregated.convDepth || {};
  const hourlyRows = Array.isArray(aggregated.hourlyActivity) ? aggregated.hourlyActivity : [];
  const dailyTrendRows = Array.isArray(aggregated.dailyTrend) ? aggregated.dailyTrend : [];
  const errorRows = Array.isArray(aggregated.errors) ? aggregated.errors : [];

  const totalConversations = Number(ov.total_conversations || 0);
  const totalUserMessages = Number(ov.total_triggers || 0);
  const executedTriggers = Number(ov.executed_triggers || 0);
  const totalTriggers = executedTriggers > 0 ? executedTriggers : totalUserMessages;
  const repliedTriggers = Number(ov.replied_triggers || 0);
  const noReplyTriggers = Math.max(0, executedTriggers - repliedTriggers);
  const pendingTriggers = Math.max(0, totalUserMessages - executedTriggers);
  const errorConversations = Number(ov.error_conversations || 0);
  const errorTriggers = Number(ov.error_triggers || 0);
  const totalNodeExecutions = Number(ov.total_node_executions || 0);
  const errorNodeExecutions = Number(ov.error_node_executions || 0);

  const workflowGraph = parseDbJson(workflow?.graph_json, { nodes: [], edges: [] }) || { nodes: [], edges: [] };
  const graphNodes = Array.isArray(workflowGraph.nodes) ? workflowGraph.nodes : [];
  const graphEdges = Array.isArray(workflowGraph.edges) ? workflowGraph.edges : [];
  const graphNodeById = new Map(graphNodes.map(node => [String(node.id || ''), node]));
  const nodeStatsById = new Map(nodeRows.map(row => [String(row.node_id || ''), row]));

  const resolveNodeMeta = (nodeId, fallbackName = '', fallbackType = '') => {
    const graphNode = graphNodeById.get(String(nodeId || ''));
    const statRow = nodeStatsById.get(String(nodeId || ''));
    const nodeName = (graphNode ? dbGraphNodeLabel(graphNode) : '') || String(statRow?.node_name || fallbackName || nodeId || '未命名节点');
    const nodeType = (graphNode ? dbGraphNodeType(graphNode) : '') || String(statRow?.node_type || fallbackType || 'unknown');
    return {
      nodeId: String(nodeId || ''),
      nodeName,
      nodeType,
      inCurrentGraph: Boolean(graphNode),
      graphNode
    };
  };

  // 1. Latency & Slow Nodes
  const latencyNodes = nodeRows.map(row => {
    const meta = resolveNodeMeta(row.node_id, row.node_name, row.node_type);
    const executionCount = Number(row.execution_count || 0);
    const triggerCount = Number(row.trigger_count || 0);
    const errorCount = Number(row.error_count || 0);
    const avgDurationMs = Number(row.avg_duration_ms || 0);
    const p50DurationMs = Number(row.p50_duration_ms || 0);
    const p95DurationMs = Number(row.p95_duration_ms || 0);
    const maxDurationMs = Number(row.max_duration_ms || 0);
    return {
      nodeId: meta.nodeId,
      nodeName: meta.nodeName,
      nodeType: meta.nodeType,
      inCurrentGraph: meta.inCurrentGraph,
      isHistorical: !meta.inCurrentGraph,
      executionCount,
      triggerCount,
      triggerHitCount: triggerCount,
      triggerHitRate: Math.min(100, dbRate(triggerCount, totalTriggers)),
      conversationCount: Number(row.conversation_count || 0),
      errorCount,
      errorRate: dbRate(errorCount, executionCount),
      avgMs: avgDurationMs,
      p50Ms: p50DurationMs,
      p95Ms: p95DurationMs,
      maxMs: maxDurationMs,
      avgDurationMs,
      p50DurationMs,
      p95DurationMs,
      maxDurationMs,
      slowestSample: row.slowest_trigger_id ? {
        conversationId: String(row.slowest_conversation_id || ''),
        triggerMessageId: String(row.slowest_trigger_id || ''),
        durationMs: maxDurationMs
      } : null
    };
  }).sort((a, b) => b.p95DurationMs - a.p95DurationMs || b.avgDurationMs - a.avgDurationMs || b.maxDurationMs - a.maxDurationMs || b.executionCount - a.executionCount);

  // 2. All Nodes Hit Stats (graph nodes + historical executed nodes)
  const allNodeIds = [
    ...graphNodes.map(node => String(node.id || '')).filter(Boolean),
    ...nodeRows.map(row => String(row.node_id || '')).filter(nodeId => nodeId && !graphNodeById.has(nodeId))
  ];
  const allNodes = allNodeIds.map(nodeId => {
    const meta = resolveNodeMeta(nodeId);
    const row = nodeStatsById.get(nodeId);
    const executionCount = Number(row?.execution_count || 0);
    const triggerCount = Number(row?.trigger_count || 0);
    const conversationCount = Number(row?.conversation_count || 0);
    const errorCount = Number(row?.error_count || 0);
    const successCount = Math.max(0, executionCount - errorCount);
    return {
      nodeId,
      nodeName: meta.nodeName,
      nodeType: meta.nodeType,
      inCurrentGraph: meta.inCurrentGraph,
      isHistorical: !meta.inCurrentGraph,
      executionCount,
      triggerCount,
      triggerHitCount: triggerCount,
      conversationCount,
      triggerHitRate: Math.min(100, dbRate(triggerCount, totalTriggers)),
      successCount,
      errorCount,
      errorRate: dbRate(errorCount, executionCount),
      successRate: executionCount > 0 ? dbRate(successCount, executionCount) : 100,
      avgDurationMs: Number(row?.avg_duration_ms || 0),
      p95DurationMs: Number(row?.p95_duration_ms || 0),
      maxDurationMs: Number(row?.max_duration_ms || 0)
    };
  }).sort((a, b) => b.triggerCount - a.triggerCount || b.executionCount - a.executionCount || Number(b.inCurrentGraph) - Number(a.inCurrentGraph));

  // 3. Condition Nodes Branch Distribution
  const conditionNodeIds = [...new Set([
    ...graphNodes.filter(node => dbGraphNodeType(node) === 'condition').map(node => String(node.id || '')),
    ...nodeRows.filter(row => String(row.node_type || '') === 'condition').map(row => String(row.node_id || '')),
    ...conditionRows.map(row => String(row.node_id || ''))
  ].filter(Boolean))];

  const conditionNodes = conditionNodeIds.map(nodeId => {
    const meta = resolveNodeMeta(nodeId);
    const statRow = nodeStatsById.get(nodeId);
    const config = meta.graphNode?.data?.config || {};
    const configBranches = Array.isArray(config.branches) ? config.branches : [];
    const elseBranchObj = config.elseBranch && typeof config.elseBranch === 'object' ? config.elseBranch : null;
    const defaultId = String(elseBranchObj?.id || 'default').trim() || 'default';
    const defaultLabel = String(elseBranchObj?.label || elseBranchObj?.name || config.defaultBranch || '默认').trim() || '默认';
    const branchItems = configBranches
      .map((branch, idx) => ({
        id: String(branch?.id || branch?.label || branch?.name || `branch_${idx}`).trim(),
        label: String(branch?.label || branch?.name || branch?.id || `分支 ${idx + 1}`).trim(),
        branchIndex: idx,
        isDefault: false,
        isHistorical: false
      }))
      .filter(item => item.id && item.label);
    if (!branchItems.some(item => item.id === defaultId || item.id === 'default' || item.label === defaultLabel)) {
      branchItems.push({ id: defaultId, label: defaultLabel, branchIndex: branchItems.length, isDefault: true, isHistorical: false });
    }

    const outgoingEdges = graphEdges.filter(edge => String(edge?.source || '') === nodeId);
    const claimedEdgeSet = new Set();
    const resolveBranchTargets = branchItem => {
      const idx = branchItem.branchIndex;
      const indexHandles = Number.isInteger(idx)
        ? [String(idx), `branch_${idx}`, `branch-${idx}`, `case_${idx}`, `case-${idx}`, `handle_${idx}`, `handle-${idx}`]
        : [];
      const matchedEdges = outgoingEdges.filter(edge => {
        if (claimedEdgeSet.has(edge)) return false;
        const sourceHandle = String(edge?.sourceHandle || '').trim();
        const edgeLabel = String(edge?.label || '').trim();
        if (!sourceHandle && !edgeLabel) return false;
        if (
          sourceHandle === branchItem.id
          || sourceHandle === branchItem.label
          || edgeLabel === branchItem.id
          || edgeLabel === branchItem.label
          || (!branchItem.isDefault && indexHandles.includes(sourceHandle))
        ) {
          claimedEdgeSet.add(edge);
          return true;
        }
        if (
          branchItem.isDefault
          && ['default', 'else', 'otherwise', 'fallback', '默认', '其他', '否则', defaultId, defaultLabel].some(
            k => k && (sourceHandle === k || edgeLabel === k)
          )
        ) {
          claimedEdgeSet.add(edge);
          return true;
        }
        return false;
      });
      const seenTargets = new Set();
      return matchedEdges.map(edge => {
        const targetId = String(edge.target || '');
        if (!targetId || seenTargets.has(targetId)) return null;
        seenTargets.add(targetId);
        const targetMeta = resolveNodeMeta(targetId);
        return {
          nodeId: targetId,
          nodeName: targetMeta.nodeName,
          nodeType: targetMeta.nodeType
        };
      }).filter(Boolean);
    };

    const hitCountByBranchId = new Map(branchItems.map(item => [item.id, 0]));
    const rowsForCondition = conditionRows.filter(row => String(row.node_id || '') === nodeId);
    let unmatchedCount = 0;

    rowsForCondition.forEach(row => {
      const count = Number(row.execution_count || 0);
      if (count <= 0) return;
      const matchedKeys = dbExtractMatchedBranches(row.condition_output, branchItems, defaultLabel);
      if (!matchedKeys.length) {
        unmatchedCount += count;
        return;
      }
      matchedKeys.forEach(key => {
        let branch = branchItems.find(item => item.id === key || item.label === key || (item.isDefault && (key === 'default' || key === 'else')));
        if (!branch) {
          branch = { id: key, label: key, isDefault: key === 'default' || key === 'else', isHistorical: true };
          branchItems.push(branch);
          hitCountByBranchId.set(branch.id, 0);
        }
        hitCountByBranchId.set(branch.id, (hitCountByBranchId.get(branch.id) || 0) + count);
      });
    });

    const executionCount = Number(statRow?.execution_count || rowsForCondition.reduce((s, r) => s + Number(r.execution_count || 0), 0));
    const triggerCount = Number(statRow?.trigger_count || executionCount);

    const branches = branchItems.map(item => {
      const hitCount = hitCountByBranchId.get(item.id) || 0;
      const targetNodes = resolveBranchTargets(item);
      return {
        id: item.id,
        branchKey: item.id,
        label: item.label,
        branchName: item.label,
        isDefault: item.isDefault,
        isHistorical: item.isHistorical,
        targetNodes,
        targetNodeName: targetNodes.map(t => t.nodeName).join('、'),
        hitCount,
        branchRate: dbRate(hitCount, executionCount),
        workflowRate: Math.min(100, dbRate(hitCount, totalTriggers))
      };
    });

    const unclaimedEdges = outgoingEdges.filter(edge => !claimedEdgeSet.has(edge));
    if (unclaimedEdges.length && branches.length) {
      const emptyBranches = branches.filter(b => !b.targetNodes.length);
      const fallbackBranch = [...branches].sort((a, b) => (b.hitCount - a.hitCount) || (Number(a.isDefault) - Number(b.isDefault)))[0];
      unclaimedEdges.forEach((edge, idx) => {
        const targetId = String(edge.target || '').trim();
        if (!targetId) return;
        const targetBranch = emptyBranches[idx] || fallbackBranch;
        if (targetBranch.targetNodes.some(t => t.nodeId === targetId)) return;
        const targetMeta = resolveNodeMeta(targetId);
        targetBranch.targetNodes.push({
          nodeId: targetId,
          nodeName: targetMeta.nodeName,
          nodeType: targetMeta.nodeType
        });
        targetBranch.targetNodeName = targetBranch.targetNodes.map(t => t.nodeName).join('、');
      });
    }

    if (unmatchedCount > 0) {
      branches.push({
        id: '__unmatched__',
        branchKey: '__unmatched__',
        label: '未记录/异常未命中',
        branchName: '未记录/异常未命中',
        isDefault: false,
        isHistorical: false,
        targetNodes: [],
        targetNodeName: '',
        hitCount: unmatchedCount,
        branchRate: dbRate(unmatchedCount, executionCount),
        workflowRate: Math.min(100, dbRate(unmatchedCount, totalTriggers))
      });
    }

    return {
      nodeId,
      nodeName: meta.nodeName,
      inCurrentGraph: meta.inCurrentGraph,
      isHistorical: !meta.inCurrentGraph,
      position: {
        x: Number(meta.graphNode?.position?.x || 0),
        y: Number(meta.graphNode?.position?.y || 0)
      },
      executionCount,
      triggerCount,
      triggerHitRate: Math.min(100, dbRate(triggerCount, totalTriggers)),
      branches
    };
  });

  const allNodesById = new Map(allNodes.map(item => [item.nodeId, item]));
  const flowGraph = {
    nodes: graphNodes.map(node => {
      const nodeId = String(node?.id || '').trim();
      if (!nodeId) return null;
      const meta = resolveNodeMeta(nodeId);
      const stat = allNodesById.get(nodeId);
      return {
        nodeId,
        nodeName: meta.nodeName,
        nodeType: meta.nodeType,
        position: {
          x: Number(node?.position?.x || 0),
          y: Number(node?.position?.y || 0)
        },
        executionCount: stat?.executionCount || 0,
        triggerCount: stat?.triggerCount || 0,
        triggerHitCount: stat?.triggerHitCount || 0,
        triggerHitRate: stat?.triggerHitRate || 0,
        errorCount: stat?.errorCount || 0
      };
    }).filter(Boolean),
    edges: graphEdges.map((edge, idx) => {
      const source = String(edge?.source || '').trim();
      const target = String(edge?.target || '').trim();
      if (!source || !target) return null;
      return {
        id: String(edge?.id || `edge-${idx}-${source}-${target}`),
        source,
        target,
        sourceHandle: String(edge?.sourceHandle || '').trim(),
        label: String(edge?.label || '').trim()
      };
    }).filter(Boolean)
  };

  // Enrich conditionNodes with topological level, upstreamSources, and per-branch downstreamConditions
  const conditionNodeSet = new Set(conditionNodes.map(c => c.nodeId));
  const outgoingEdgesBySource = new Map();
  flowGraph.edges.forEach(edge => {
    if (!outgoingEdgesBySource.has(edge.source)) outgoingEdgesBySource.set(edge.source, []);
    outgoingEdgesBySource.get(edge.source).push(edge);
  });

  const traceDownstreamFromTargets = startTargets => {
    const downstreamConditions = [];
    const seenConditionIds = new Set();
    const visited = new Set();
    const queue = [];
    const terminalNodeTypes = new Set();
    const allViaNodes = [];
    const seenViaIds = new Set();

    (startTargets || []).forEach(target => {
      const targetId = String(target?.nodeId || '').trim();
      if (!targetId) return;
      if (conditionNodeSet.has(targetId)) {
        if (!seenConditionIds.has(targetId)) {
          seenConditionIds.add(targetId);
          const condMeta = resolveNodeMeta(targetId);
          downstreamConditions.push({
            nodeId: targetId,
            nodeName: condMeta.nodeName,
            viaCount: 0,
            viaNodes: []
          });
        }
      } else if (!visited.has(targetId)) {
        visited.add(targetId);
        const meta = resolveNodeMeta(targetId, target.nodeName, target.nodeType);
        const viaItem = { nodeId: meta.nodeId, nodeName: meta.nodeName, nodeType: meta.nodeType };
        queue.push({ currentId: targetId, viaNodes: [viaItem] });
      }
    });

    while (queue.length > 0) {
      const { currentId, viaNodes } = queue.shift();
      viaNodes.forEach(v => {
        if (!seenViaIds.has(v.nodeId)) {
          seenViaIds.add(v.nodeId);
          allViaNodes.push(v);
        }
      });
      const nextEdges = outgoingEdgesBySource.get(currentId) || [];
      if (!nextEdges.length) {
        const lastMeta = resolveNodeMeta(currentId);
        terminalNodeTypes.add(lastMeta.nodeType);
      }
      nextEdges.forEach(edge => {
        const nextId = edge.target;
        if (!nextId) return;
        if (conditionNodeSet.has(nextId)) {
          if (!seenConditionIds.has(nextId)) {
            seenConditionIds.add(nextId);
            const condMeta = resolveNodeMeta(nextId);
            downstreamConditions.push({
              nodeId: nextId,
              nodeName: condMeta.nodeName,
              viaCount: viaNodes.length,
              viaNodes
            });
          }
        } else if (!visited.has(nextId)) {
          visited.add(nextId);
          const nextMeta = resolveNodeMeta(nextId);
          if (nextMeta.nodeType === 'lingxi_send' || nextMeta.nodeType === 'output') {
            terminalNodeTypes.add(nextMeta.nodeType);
          }
          queue.push({
            currentId: nextId,
            viaNodes: [...viaNodes, { nodeId: nextMeta.nodeId, nodeName: nextMeta.nodeName, nodeType: nextMeta.nodeType }]
          });
        }
      });
    }

    return {
      downstreamConditions,
      hasReplySend: terminalNodeTypes.has('lingxi_send') || allViaNodes.some(v => v.nodeType === 'lingxi_send'),
      viaCount: allViaNodes.length,
      viaNodes: allViaNodes
    };
  };

  const upstreamByConditionId = new Map(conditionNodes.map(c => [c.nodeId, []]));
  const triggerFlowNodes = flowGraph.nodes.filter(n => n.nodeType === 'lingxi_trigger');
  triggerFlowNodes.forEach(trig => {
    const directTargets = (outgoingEdgesBySource.get(trig.nodeId) || []).map(e => resolveNodeMeta(e.target));
    const traced = traceDownstreamFromTargets(directTargets);
    traced.downstreamConditions.forEach(dc => {
      upstreamByConditionId.get(dc.nodeId)?.push({
        sourceType: 'trigger',
        nodeId: trig.nodeId,
        nodeName: trig.nodeName,
        branchKey: '',
        branchName: '',
        hitCount: trig.triggerHitCount || trig.executionCount || 0,
        viaCount: dc.viaCount,
        viaNodes: dc.viaNodes
      });
    });
  });

  conditionNodes.forEach(condNode => {
    condNode.branches.forEach(branch => {
      const traced = traceDownstreamFromTargets(branch.targetNodes);
      branch.downstreamConditions = traced.downstreamConditions;
      branch.hasReplySend = traced.hasReplySend;
      branch.viaCount = traced.viaCount;
      branch.viaNodes = traced.viaNodes;
      traced.downstreamConditions.forEach(dc => {
        if (dc.nodeId === condNode.nodeId) return;
        upstreamByConditionId.get(dc.nodeId)?.push({
          sourceType: 'condition',
          nodeId: condNode.nodeId,
          nodeName: condNode.nodeName,
          branchKey: branch.branchKey,
          branchName: branch.branchName,
          hitCount: branch.hitCount,
          branchRate: branch.branchRate,
          viaCount: dc.viaCount,
          viaNodes: dc.viaNodes
        });
      });
    });
  });

  const distFromTrigger = new Map();
  const bfsQueue = [];
  triggerFlowNodes.forEach(trig => {
    distFromTrigger.set(trig.nodeId, 0);
    bfsQueue.push(trig.nodeId);
  });
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift();
    const d = distFromTrigger.get(curr) || 0;
    (outgoingEdgesBySource.get(curr) || []).forEach(edge => {
      if (edge.target && !distFromTrigger.has(edge.target)) {
        distFromTrigger.set(edge.target, d + 1);
        bfsQueue.push(edge.target);
      }
    });
  }

  const condById = new Map(conditionNodes.map(c => [c.nodeId, c]));
  const condOutMap = new Map(conditionNodes.map(c => [c.nodeId, new Set()]));
  conditionNodes.forEach(c => {
    (upstreamByConditionId.get(c.nodeId) || []).forEach(u => {
      if (u.sourceType === 'condition' && u.nodeId !== c.nodeId && condOutMap.has(u.nodeId)) {
        condOutMap.get(u.nodeId).add(c.nodeId);
      }
    });
  });

  const canReachCond = (fromId, targetId) => {
    const visited = new Set([fromId]);
    const q = [fromId];
    while (q.length > 0) {
      const curr = q.shift();
      const nexts = condOutMap.get(curr);
      if (!nexts) continue;
      for (const nxt of nexts) {
        if (nxt === targetId) return true;
        if (!visited.has(nxt)) {
          visited.add(nxt);
          q.push(nxt);
        }
      }
    }
    return false;
  };

  const isPriorCondition = (aId, bId) => {
    const da = distFromTrigger.has(aId) ? distFromTrigger.get(aId) : Number.MAX_SAFE_INTEGER;
    const db = distFromTrigger.has(bId) ? distFromTrigger.get(bId) : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da < db;
    const ca = condById.get(aId);
    const cb = condById.get(bId);
    const xa = Number(ca?.position?.x || 0);
    const xb = Number(cb?.position?.x || 0);
    if (Math.abs(xa - xb) > 10) return xa < xb;
    const ta = Number(ca?.triggerCount || ca?.executionCount || 0);
    const tb = Number(cb?.triggerCount || cb?.executionCount || 0);
    if (ta !== tb) return ta > tb;
    return String(aId).localeCompare(String(bId)) < 0;
  };

  const forwardEdges = [];
  condOutMap.forEach((targets, uId) => {
    targets.forEach(vId => {
      const inCycle = canReachCond(vId, uId);
      if (inCycle && isPriorCondition(vId, uId)) return;
      forwardEdges.push([uId, vId]);
    });
  });

  const relaxForwardLevels = lvlMap => {
    for (let pass = 0; pass < conditionNodes.length; pass++) {
      let changed = false;
      forwardEdges.forEach(([uId, vId]) => {
        const uLvl = lvlMap.get(uId) || 1;
        const vLvl = lvlMap.get(vId) || 1;
        if (vLvl < uLvl + 1) {
          lvlMap.set(vId, uLvl + 1);
          changed = true;
        }
      });
      if (!changed) break;
    }
  };

  const conditionLevelMap = new Map(conditionNodes.map(c => [c.nodeId, 1]));
  relaxForwardLevels(conditionLevelMap);

  const hasIncomingCond = new Set(forwardEdges.map(([, vId]) => vId));
  const hasIncomingTrig = new Set();
  conditionNodes.forEach(c => {
    if ((upstreamByConditionId.get(c.nodeId) || []).some(u => u.sourceType === 'trigger')) {
      hasIncomingTrig.add(c.nodeId);
    }
  });

  const orderedCondIds = conditionNodes.map(c => c.nodeId).sort((a, b) => (isPriorCondition(a, b) ? -1 : 1));
  if (!hasIncomingTrig.size && orderedCondIds.length > 0) {
    hasIncomingTrig.add(orderedCondIds[0]);
  }

  orderedCondIds.forEach(nodeId => {
    if (hasIncomingCond.has(nodeId) || hasIncomingTrig.has(nodeId)) return;
    const cond = condById.get(nodeId);
    const posX = Number(cond?.position?.x || 0);
    const hits = Number(cond?.triggerCount || cond?.executionCount || 0);
    let baseLevel = hasIncomingTrig.size > 0 ? 2 : 1;
    orderedCondIds.forEach(otherId => {
      if (otherId === nodeId) return;
      const otherCond = condById.get(otherId);
      const otherLvl = conditionLevelMap.get(otherId) || 1;
      const otherX = Number(otherCond?.position?.x || 0);
      const otherHits = Number(otherCond?.triggerCount || otherCond?.executionCount || 0);
      if (flowGraph.edges.length > 0 && cond?.inCurrentGraph !== false && otherCond?.inCurrentGraph !== false && posX > 0 && otherX > 0) {
        if (otherX + 60 < posX) {
          baseLevel = Math.max(baseLevel, otherLvl + 1);
        }
      } else if (otherHits > hits) {
        baseLevel = Math.max(baseLevel, otherLvl + 1);
      }
    });
    if ((conditionLevelMap.get(nodeId) || 1) < baseLevel) {
      conditionLevelMap.set(nodeId, baseLevel);
      relaxForwardLevels(conditionLevelMap);
    }
  });

  conditionNodes.forEach(c => {
    c.level = conditionLevelMap.get(c.nodeId) || 1;
    c.upstreamSources = upstreamByConditionId.get(c.nodeId) || [];
    const defaultBranchItem = c.branches.find(b => b.isDefault);
    const defaultLabel = defaultBranchItem ? defaultBranchItem.label : '默认';
    const timeRowsForCond = conditionTimeRows.filter(r => String(r.node_id || '') === c.nodeId);
    const bucketMap = new Map();
    timeRowsForCond.forEach(r => {
      const bucket = String(r.time_bucket || '').trim() || '未知';
      const count = Number(r.execution_count || 0);
      if (count <= 0) return;
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, { total: 0, byBranchId: new Map() });
      }
      const bEntry = bucketMap.get(bucket);
      bEntry.total += count;
      const matchedKeys = dbExtractMatchedBranches(r.condition_output, c.branches, defaultLabel);
      if (!matchedKeys.length) {
        bEntry.byBranchId.set('__unmatched__', (bEntry.byBranchId.get('__unmatched__') || 0) + count);
        return;
      }
      matchedKeys.forEach(key => {
        const branch = c.branches.find(item => item.id === key || item.label === key || (item.isDefault && (key === 'default' || key === 'else')));
        const bId = branch ? branch.id : key;
        bEntry.byBranchId.set(bId, (bEntry.byBranchId.get(bId) || 0) + count);
      });
    });
    c.timeSeries = [...bucketMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, bEntry]) => {
        const label = bucket.replace(/^\d{4}-/, '');
        return {
          bucket,
          label,
          timeBucket: label,
          total: bEntry.total,
          totalCount: bEntry.total,
          branches: c.branches.map(b => {
            const hitCount = bEntry.byBranchId.get(b.id) || 0;
            const rate = dbRate(hitCount, bEntry.total);
            return {
              id: b.id,
              branchKey: b.id,
              label: b.label,
              branchName: b.label,
              isDefault: b.isDefault,
              hitCount,
              rate,
              branchRate: rate
            };
          })
        };
      });
  });
  conditionNodes.sort((a, b) => (a.level - b.level) || (Number(b.inCurrentGraph) - Number(a.inCurrentGraph)) || ((a.position?.x || 0) - (b.position?.x || 0)) || (b.executionCount - a.executionCount));

  // 5. Operations & Funnel Analytics
  const activeCondNodes = conditionNodes.filter(c => c.inCurrentGraph !== false || c.triggerCount > 0);
  const conditionFunnelSteps = activeCondNodes.map(c => {
    const branchesWithFlow = c.branches.filter(b => b.hasReplySend || (b.downstreamConditions && b.downstreamConditions.length > 0));
    const activeBranches = branchesWithFlow.length > 0
      ? branchesWithFlow
      : c.branches.filter(b => !b.isDefault && b.id !== '__unmatched__');
    const activeBranchIds = new Set(activeBranches.map(b => b.id));
    const forwardCount = c.branches.filter(b => activeBranchIds.has(b.id)).reduce((s, b) => s + (b.hitCount || 0), 0);
    const dropBranches = c.branches
      .filter(b => !activeBranchIds.has(b.id) && (b.hitCount || 0) > 0)
      .sort((a, b) => b.hitCount - a.hitCount);
    const dropCount = Math.max(0, c.triggerCount - forwardCount);
    const passCount = Math.min(c.triggerCount, forwardCount);
    const passRate = dbRate(passCount, c.triggerCount);
    const dropRate = dbRate(dropCount, c.triggerCount);
    const globalReachRate = Math.min(100, dbRate(c.triggerCount, totalTriggers));
    return {
      nodeId: c.nodeId,
      nodeName: c.nodeName,
      level: c.level,
      reachedCount: c.triggerCount,
      triggerHitCount: c.triggerCount,
      reachedRate: globalReachRate,
      globalReachRate,
      forwardCount: passCount,
      passCount,
      forwardRate: passRate,
      passRate,
      dropCount,
      dropRate,
      activeBranches: activeBranches.map(b => ({ id: b.id, branchKey: b.id, label: b.label, branchName: b.label, hitCount: b.hitCount, branchRate: b.branchRate, hasReplySend: b.hasReplySend })),
      dropBranches: dropBranches.map(b => ({ id: b.id, branchKey: b.id, label: b.label, branchName: b.label, hitCount: b.hitCount, branchRate: b.branchRate }))
    };
  });

  // Macro conversion funnel stages
  const firstLevelConds = activeCondNodes.filter(c => c.level === 1);
  const reachedFirstCondCount = firstLevelConds.length
    ? Math.min(executedTriggers, Math.max(...firstLevelConds.map(c => c.triggerCount), firstLevelConds.reduce((s, c) => s + c.triggerCount, 0)))
    : executedTriggers;
  const entryCount = totalUserMessages || totalTriggers;
  const funnelStages = [
    {
      key: 'trigger_entry',
      stageName: '收到学员消息触发',
      title: '收到学员消息触发',
      subtitle: '进入工作流触发器',
      stageType: 'entry',
      level: 0,
      count: entryCount,
      globalRate: 100,
      stepRate: 100,
      dropCount: pendingTriggers,
      dropRate: dbRate(pendingTriggers, entryCount),
      dropSummary: pendingTriggers > 0 ? `${pendingTriggers} 轮待处理/未启动` : '全部进入工作流执行',
      dropReasons: pendingTriggers > 0 ? `${pendingTriggers} 轮待处理/未启动` : ''
    }
  ];
  if (activeCondNodes.length > 0) {
    // Group by condition level to form clean sequential funnel stages
    const maxLevel = Math.max(...activeCondNodes.map(c => c.level));
    let prevCount = entryCount;
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      const lvlConds = conditionFunnelSteps.filter(c => c.level === lvl);
      if (!lvlConds.length) continue;
      const primaryCond = [...lvlConds].sort((a, b) => b.reachedCount - a.reachedCount)[0];
      const stageCount = lvlConds.length === 1
        ? primaryCond.reachedCount
        : Math.min(prevCount, lvlConds.reduce((s, c) => s + c.reachedCount, 0));
      if (stageCount <= 0 && lvl > 1) continue;
      const topDrop = primaryCond.dropBranches[0];
      const dropFromPrev = Math.max(0, prevCount - stageCount);
      const stageName = lvlConds.length === 1 ? `条件分流：${primaryCond.nodeName}` : `第 ${lvl} 级条件分流 (${lvlConds.map(c => c.nodeName).join(' / ')})`;
      const dropSummary = topDrop
        ? `本级分流拦截：${topDrop.label} (${topDrop.hitCount} 轮 · ${topDrop.branchRate}%)`
        : `本级继续流转 ${primaryCond.forwardCount} 轮 (${primaryCond.forwardRate}%)`;
      funnelStages.push({
        key: `level_${lvl}_${primaryCond.nodeId}`,
        nodeId: primaryCond.nodeId,
        stageName,
        title: stageName,
        subtitle: `第 ${lvl} 层条件节点过滤`,
        stageType: 'condition',
        level: lvl,
        count: stageCount,
        globalRate: Math.min(100, dbRate(stageCount, totalTriggers)),
        stepRate: Math.min(100, dbRate(stageCount, prevCount)),
        dropCount: dropFromPrev,
        dropRate: dbRate(dropFromPrev, prevCount),
        forwardCount: primaryCond.forwardCount,
        forwardRate: primaryCond.forwardRate,
        dropSummary,
        dropReasons: dropSummary
      });
      prevCount = stageCount;
    }
    const finalDrop = Math.max(0, prevCount - repliedTriggers);
    const finalDropSummary = finalDrop > 0 ? `分流静默或未触发回复 ${finalDrop} 轮` : '';
    funnelStages.push({
      key: 'replied',
      stageName: '成功发出 AI 消息回复',
      title: '成功发出 AI 消息回复',
      subtitle: '触发灵犀发信节点 (actionType=6)',
      stageType: 'reply',
      level: maxLevel + 1,
      count: repliedTriggers,
      globalRate: Math.min(100, dbRate(repliedTriggers, totalTriggers)),
      stepRate: Math.min(100, dbRate(repliedTriggers, prevCount)),
      dropCount: finalDrop,
      dropRate: dbRate(finalDrop, prevCount),
      dropSummary: finalDrop > 0 ? `分流静默或未触发回复 ${finalDrop} 轮` : '全部成功发出回复',
      dropReasons: finalDropSummary
    });
  } else {
    const baseCount = entryCount;
    funnelStages.push({
      key: 'workflow_exec',
      stageName: '工作流节点执行',
      title: '工作流节点执行',
      subtitle: '执行工作流节点逻辑',
      stageType: 'exec',
      level: 1,
      count: executedTriggers,
      globalRate: Math.min(100, dbRate(executedTriggers, baseCount)),
      stepRate: Math.min(100, dbRate(executedTriggers, baseCount)),
      dropCount: pendingTriggers,
      dropRate: dbRate(pendingTriggers, baseCount),
      dropSummary: pendingTriggers > 0 ? `未执行 ${pendingTriggers} 轮` : '100% 启动执行',
      dropReasons: pendingTriggers > 0 ? `未执行 ${pendingTriggers} 轮` : ''
    });
    funnelStages.push({
      key: 'replied',
      stageName: '成功发出 AI 消息回复',
      title: '成功发出 AI 消息回复',
      subtitle: '触发灵犀发信节点 (actionType=6)',
      stageType: 'reply',
      level: 2,
      count: repliedTriggers,
      globalRate: Math.min(100, dbRate(repliedTriggers, totalTriggers)),
      stepRate: Math.min(100, dbRate(repliedTriggers, executedTriggers)),
      dropCount: noReplyTriggers,
      dropRate: dbRate(noReplyTriggers, executedTriggers),
      dropSummary: noReplyTriggers > 0 ? `未发出回复 ${noReplyTriggers} 轮` : '全部成功回复',
      dropReasons: noReplyTriggers > 0 ? `未发出回复 ${noReplyTriggers} 轮` : ''
    });
  }

  // No-Reply Attribution
  let conditionSilentTriggers = 0;
  let normalNoSendTriggers = 0;
  let errorInterruptedTriggers = 0;
  const silentBranchGroupMap = new Map();
  const rawOccByReasonKey = {
    condition_filtered: [],
    normal_no_send: [],
    error_interrupted: [],
    pending: []
  };

  const resolveConditionBranchLabel = (condIdRaw, condOutputRaw) => {
    const condId = String(condIdRaw || '').trim();
    if (!condId) return { condId: '', condName: '', branchId: '', branchLabel: '' };
    const condNode = condById.get(condId);
    const condName = condNode?.nodeName || condId;
    const branchList = condNode?.branches || [];
    const defBranch = branchList.find(b => b.isDefault);
    const matchedKeys = dbExtractMatchedBranches(condOutputRaw, branchList, defBranch?.label || '默认');
    const branchKey = matchedKeys[0] || 'default';
    const branchObj = branchList.find(b => b.id === branchKey || b.label === branchKey || (b.isDefault && (branchKey === 'default' || branchKey === 'else')));
    const branchLabel = branchObj?.label || (branchKey === 'default' ? '默认分支' : branchKey);
    return {
      condId,
      condName,
      branchId: branchObj?.id || branchKey,
      branchLabel
    };
  };

  noReplyRows.forEach(row => {
    const cnt = Number(row.trigger_count || 0);
    const convCnt = Number(row.conversation_count || 0);
    if (cnt <= 0) return;
    const rType = String(row.reason_type || '');
    const normalizedReasonKey = (rType === 'condition_silent' || rType === 'condition_filtered')
      ? 'condition_filtered'
      : (rType === 'error_interrupted' ? 'error_interrupted' : (rType === 'pending' ? 'pending' : 'normal_no_send'));

    if (Array.isArray(row.occurrences) && row.occurrences.length > 0) {
      rawOccByReasonKey[normalizedReasonKey].push(...row.occurrences);
    } else if (row.sample_conversation_id) {
      rawOccByReasonKey[normalizedReasonKey].push({
        conversation_id: row.sample_conversation_id,
        trigger_id: row.sample_trigger_id || '',
        occurred_at: row.last_occurred_at || '',
        duration_ms: 0,
        last_node_id: row.last_node_id || row.cond_node_id || '',
        last_node_name: row.last_node_name || row.cond_node_name || '',
        last_node_type: row.last_node_type || (row.cond_node_id ? 'condition' : ''),
        cond_node_id: row.cond_node_id || row.last_cond_node_id || '',
        cond_node_name: row.cond_node_name || row.last_cond_node_name || '',
        cond_output: row.cond_output ?? row.last_cond_output ?? null
      });
    }

    if (rType === 'error_interrupted') {
      errorInterruptedTriggers += cnt;
    } else if (rType === 'condition_silent' || rType === 'condition_filtered') {
      conditionSilentTriggers += cnt;
      const condId = String(row.cond_node_id || row.last_cond_node_id || '').trim();
      const condNode = condById.get(condId);
      const condName = condNode?.nodeName || String(row.cond_node_name || row.last_cond_node_name || condId || '条件节点');
      const branchList = condNode?.branches || [];
      const defBranch = branchList.find(b => b.isDefault);
      const matchedKeys = dbExtractMatchedBranches(row.cond_output ?? row.last_cond_output, branchList, defBranch?.label || '默认');
      const branchKey = matchedKeys[0] || 'default';
      const branchObj = branchList.find(b => b.id === branchKey || b.label === branchKey || (b.isDefault && (branchKey === 'default' || branchKey === 'else')));
      const branchLabel = branchObj?.label || (branchKey === 'default' ? '默认分支' : branchKey);
      const groupKey = `${condId}:${branchObj?.id || branchKey}`;
      if (!silentBranchGroupMap.has(groupKey)) {
        silentBranchGroupMap.set(groupKey, {
          key: groupKey,
          nodeId: condId,
          nodeName: condName,
          branchId: branchObj?.id || branchKey,
          branchKey: branchObj?.id || branchKey,
          branchLabel,
          branchName: branchLabel,
          isDefault: Boolean(branchObj?.isDefault || branchKey === 'default' || branchKey === 'else'),
          triggerCount: 0,
          conversationCount: 0,
          sampleConversationId: String(row.sample_conversation_id || ''),
          sampleTriggerMessageId: String(row.sample_trigger_id || '')
        });
      }
      const g = silentBranchGroupMap.get(groupKey);
      g.triggerCount += cnt;
      g.conversationCount += convCnt || 1;
      if (!g.sampleConversationId && row.sample_conversation_id) {
        g.sampleConversationId = String(row.sample_conversation_id);
        g.sampleTriggerMessageId = String(row.sample_trigger_id || '');
      }
    } else {
      normalNoSendTriggers += cnt;
    }
  });

  const formatNoReplyOccurrences = rawList => {
    const seen = new Set();
    return (rawList || [])
      .filter(occ => {
        const k = `${occ.conversation_id || ''}:${occ.trigger_id || ''}`;
        if (!occ.conversation_id && !occ.trigger_id) return false;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
      .slice(0, 500)
      .map((occ, idx) => {
        const lastMeta = occ.last_node_id ? resolveNodeMeta(occ.last_node_id, occ.last_node_name, occ.last_node_type) : null;
        const condInfo = resolveConditionBranchLabel(occ.cond_node_id, occ.cond_output);
        return {
          key: `noreply:${occ.conversation_id || ''}:${occ.trigger_id || ''}:${idx}`,
          seqNo: idx + 1,
          conversationId: String(occ.conversation_id || ''),
          triggerMessageId: String(occ.trigger_id || ''),
          occurredAt: formatDbDisplayDateTimeLoose(occ.occurred_at),
          durationMs: Math.max(0, Number(occ.duration_ms || 0) || 0),
          lastNodeId: lastMeta?.nodeId || String(occ.last_node_id || ''),
          lastNodeName: lastMeta?.nodeName || String(occ.last_node_name || ''),
          lastNodeType: lastMeta?.nodeType || String(occ.last_node_type || ''),
          condNodeId: condInfo.condId,
          condNodeName: condInfo.condName || String(occ.cond_node_name || ''),
          condBranchLabel: condInfo.branchLabel
        };
      });
  };

  // Fallback if noReplyRows wasn't populated (e.g. legacy callers passing only overview)
  const totalCountedNoReply = conditionSilentTriggers + normalNoSendTriggers + errorInterruptedTriggers;
  if (totalCountedNoReply === 0 && noReplyTriggers > 0) {
    errorInterruptedTriggers = Math.min(noReplyTriggers, errorTriggers);
    const rem = Math.max(0, noReplyTriggers - errorInterruptedTriggers);
    if (activeCondNodes.length > 0) {
      conditionSilentTriggers = rem;
    } else {
      normalNoSendTriggers = rem;
    }
  }

  const totalNoReplyWithPending = noReplyTriggers + pendingTriggers;
  const noReplyReasons = [
    {
      key: 'condition_filtered',
      type: 'condition_filtered',
      label: '符合不回复条件',
      desc: '经过条件节点判断后走入不回复/静默分支（如无意向、非目标客群、无需打扰）',
      color: 'blue',
      count: conditionSilentTriggers,
      triggerCount: conditionSilentTriggers,
      rateOfNoReply: dbRate(conditionSilentTriggers, totalNoReplyWithPending),
      shareOfNoReply: dbRate(conditionSilentTriggers, totalNoReplyWithPending),
      rateOfTotal: dbRate(conditionSilentTriggers, totalUserMessages || totalTriggers),
      shareOfTotalTriggers: dbRate(conditionSilentTriggers, totalUserMessages || totalTriggers),
      occurrences: formatNoReplyOccurrences(rawOccByReasonKey.condition_filtered)
    },
    {
      key: 'normal_no_send',
      type: 'normal_no_send',
      label: '常规动作完成（无发信指令）',
      desc: '仅执行打标、变量更新或非回复类动作，流程设计本身不发送聊天消息',
      color: 'cyan',
      count: normalNoSendTriggers,
      triggerCount: normalNoSendTriggers,
      rateOfNoReply: dbRate(normalNoSendTriggers, totalNoReplyWithPending),
      shareOfNoReply: dbRate(normalNoSendTriggers, totalNoReplyWithPending),
      rateOfTotal: dbRate(normalNoSendTriggers, totalUserMessages || totalTriggers),
      shareOfTotalTriggers: dbRate(normalNoSendTriggers, totalUserMessages || totalTriggers),
      occurrences: formatNoReplyOccurrences(rawOccByReasonKey.normal_no_send)
    },
    {
      key: 'error_interrupted',
      type: 'error_interrupted',
      label: '节点执行异常中断',
      desc: '工作流执行过程中发生节点报错或超时，导致未能走到发送消息节点',
      color: 'red',
      count: errorInterruptedTriggers,
      triggerCount: errorInterruptedTriggers,
      rateOfNoReply: dbRate(errorInterruptedTriggers, totalNoReplyWithPending),
      shareOfNoReply: dbRate(errorInterruptedTriggers, totalNoReplyWithPending),
      rateOfTotal: dbRate(errorInterruptedTriggers, totalUserMessages || totalTriggers),
      shareOfTotalTriggers: dbRate(errorInterruptedTriggers, totalUserMessages || totalTriggers),
      occurrences: formatNoReplyOccurrences(rawOccByReasonKey.error_interrupted)
    },
    {
      key: 'pending',
      type: 'pending',
      label: '队列待处理 / 未触发执行',
      desc: '已记录学员消息，但尚未产生工作流节点执行记录',
      color: 'orange',
      count: pendingTriggers,
      triggerCount: pendingTriggers,
      rateOfNoReply: dbRate(pendingTriggers, totalNoReplyWithPending),
      shareOfNoReply: dbRate(pendingTriggers, totalNoReplyWithPending),
      rateOfTotal: dbRate(pendingTriggers, totalUserMessages || totalTriggers),
      shareOfTotalTriggers: dbRate(pendingTriggers, totalUserMessages || totalTriggers),
      occurrences: formatNoReplyOccurrences(rawOccByReasonKey.pending)
    }
  ].filter(item => item.count > 0 || item.key === 'condition_filtered' || item.key === 'error_interrupted');

  const silentBranches = [...silentBranchGroupMap.values()]
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 12)
    .map(item => {
      const shareRate = dbRate(item.triggerCount, Math.max(1, noReplyTriggers));
      return {
        ...item,
        shareRate,
        rateOfNoReply: shareRate,
        rateOfTotal: dbRate(item.triggerCount, totalTriggers)
      };
    });

  // Conversation Depth
  const depthTotalConvs = Number(convDepthRow.total_convs || totalConversations || 0);
  const turns1 = Number(convDepthRow.turns_1 || 0);
  const turns2_3 = Number(convDepthRow.turns_2_3 || 0);
  const turns4_6 = Number(convDepthRow.turns_4_6 || 0);
  const turns7Plus = Number(convDepthRow.turns_7_plus || 0);
  const multiTurnConvs = turns2_3 + turns4_6 + turns7Plus;
  const avgTurns = Number(convDepthRow.avg_turns || (depthTotalConvs > 0 ? Number((totalTriggers / depthTotalConvs).toFixed(1)) : 0));
  const maxTurns = Number(convDepthRow.max_turns || (depthTotalConvs > 0 ? Math.max(1, Math.ceil(avgTurns)) : 0));
  const deepestSample = convDepthRow.top_conversation_id ? {
    conversationId: String(convDepthRow.top_conversation_id),
    triggerMessageId: String(convDepthRow.top_trigger_id || ''),
    turns: maxTurns
  } : null;

  const conversationDepth = {
    totalConversations: depthTotalConvs,
    avgTurns,
    maxTurns,
    multiTurnConversations: multiTurnConvs,
    multiTurnRate: dbRate(multiTurnConvs, depthTotalConvs),
    singleTurnRate: dbRate(turns1, depthTotalConvs),
    topSample: deepestSample,
    deepestSample,
    buckets: [
      { key: '1', label: '1 轮问答', desc: '单次浅层触达即结束', shortLabel: '1 轮', count: turns1, rate: dbRate(turns1, depthTotalConvs), color: '#94a3b8' },
      { key: '2-3', label: '2 ~ 3 轮互动', desc: '初步多轮问答互动', shortLabel: '2~3 轮', count: turns2_3, rate: dbRate(turns2_3, depthTotalConvs), color: '#3b82f6' },
      { key: '4-6', label: '4 ~ 6 轮沟通', desc: '深度多轮咨询沟通', shortLabel: '4~6 轮', count: turns4_6, rate: dbRate(turns4_6, depthTotalConvs), color: '#6366f1' },
      { key: '7+', label: '7 轮以上高频', desc: '高频高意向潜客深度互动', shortLabel: '7+ 轮', count: turns7Plus, rate: dbRate(turns7Plus, depthTotalConvs), color: '#10b981' }
    ]
  };

  // Hourly Activity Distribution
  const hourlyByHour = new Map(hourlyRows.map(r => [Number(r.hour_of_day), r]));
  const hourlyDistribution = Array.from({ length: 24 }, (_, hr) => {
    const r = hourlyByHour.get(hr);
    const tCount = Number(r?.trigger_count || 0);
    const cCount = Number(r?.conversation_count || tCount);
    const repCount = Number(r?.replied_count || 0);
    const errCount = Number(r?.error_count || 0);
    return {
      hour: hr,
      label: `${String(hr).padStart(2, '0')}:00`,
      triggerCount: tCount,
      conversationCount: cCount,
      repliedCount: repCount,
      noReplyCount: Math.max(0, tCount - repCount),
      errorCount: errCount,
      replyRate: dbRate(repCount, tCount)
    };
  });
  const peakHourItem = [...hourlyDistribution].sort((a, b) => b.triggerCount - a.triggerCount)[0] || null;
  const timeActivity = {
    peakHour: peakHourItem && peakHourItem.triggerCount > 0 ? peakHourItem : null,
    hourly: hourlyDistribution,
    hours: hourlyDistribution
  };

  // Daily Trend (Conversations & Triggers by Day)
  const dailyByDate = new Map();
  dailyTrendRows.forEach(r => {
    const rawDate = String(r.day_date || r.date || '').trim().slice(0, 10);
    if (!rawDate) return;
    dailyByDate.set(rawDate, {
      date: rawDate,
      label: rawDate.replace(/^\d{4}-/, ''),
      conversationCount: Number(r.conversation_count || r.conversationCount || 0),
      triggerCount: Number(r.trigger_count || r.triggerCount || 0),
      repliedCount: Number(r.replied_count || r.repliedCount || 0),
      noReplyCount: Math.max(0, Number(r.trigger_count || r.triggerCount || 0) - Number(r.replied_count || r.repliedCount || 0)),
      errorTriggerCount: Number(r.error_trigger_count || r.errorTriggerCount || 0),
      errorConversationCount: Number(r.error_conversation_count || r.errorConversationCount || 0)
    });
  });

  const startDatePart = String(startTime || '').trim().slice(0, 10);
  const endDatePart = String(endTime || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDatePart) && /^\d{4}-\d{2}-\d{2}$/.test(endDatePart)) {
    const startUtc = Date.parse(`${startDatePart}T00:00:00Z`);
    const endUtc = Date.parse(`${endDatePart}T00:00:00Z`);
    if (Number.isFinite(startUtc) && Number.isFinite(endUtc) && endUtc >= startUtc && (endUtc - startUtc) <= 31 * 86400000) {
      for (let ts = startUtc; ts <= endUtc; ts += 86400000) {
        const dStr = new Date(ts).toISOString().slice(0, 10);
        if (!dailyByDate.has(dStr)) {
          dailyByDate.set(dStr, {
            date: dStr,
            label: dStr.replace(/^\d{4}-/, ''),
            conversationCount: 0,
            triggerCount: 0,
            repliedCount: 0,
            noReplyCount: 0,
            errorTriggerCount: 0,
            errorConversationCount: 0
          });
        }
      }
    }
  }

  const dailySeries = [...dailyByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => ({
      ...item,
      replyRate: dbRate(item.repliedCount, item.triggerCount)
    }));

  // 4. Error Aggregation Top N
  const errorsList = errorRows.map((row, index) => {
    const meta = resolveNodeMeta(row.node_id, row.node_name, row.node_type);
    const errorCount = Number(row.error_count || 0);
    const errorCode = String(row.error_code || '').trim();
    const errorClass = String(row.error_class || '').trim();
    const status = String(row.status || 'FAILED').trim();
    const errorMessage = String(row.error_message || '').trim();
    const triggerCount = Number(row.trigger_count || 0);
    const conversationCount = Number(row.conversation_count || 0);
    const sampleConversationId = String(row.sample_conversation_id || '');
    const sampleTriggerMessageId = String(row.sample_trigger_id || '');
    const lastOccurredAt = formatDbDisplayDateTimeLoose(row.last_occurred_at);
    const rawOccurrences = Array.isArray(row.occurrences) ? row.occurrences : [];
    const occurrences = rawOccurrences.length
      ? rawOccurrences.map((occ, occIndex) => ({
          key: `${occ.execution_id || occIndex}:${occ.conversation_id || ''}:${occ.trigger_id || ''}:${occIndex}`,
          executionId: String(occ.execution_id ?? occ.executionId ?? ''),
          conversationId: String(occ.conversation_id ?? occ.conversationId ?? ''),
          triggerMessageId: String(occ.trigger_id ?? occ.triggerMessageId ?? ''),
          occurredAt: formatDbDisplayDateTimeLoose(occ.occurred_at ?? occ.occurredAt),
          durationMs: Math.max(0, Number(occ.duration_ms ?? occ.durationMs ?? 0) || 0),
          errorMessage: String(occ.error_message ?? occ.errorMessage ?? errorMessage).trim()
        }))
      : (sampleConversationId
          ? [{
              key: `sample:${sampleConversationId}:${sampleTriggerMessageId}:0`,
              executionId: '',
              conversationId: sampleConversationId,
              triggerMessageId: sampleTriggerMessageId,
              occurredAt: lastOccurredAt,
              durationMs: 0,
              errorMessage
            }]
          : []);
    return {
      key: `${meta.nodeId}:${status}:${errorCode}:${errorClass}:${index}`,
      nodeId: meta.nodeId,
      nodeName: meta.nodeName,
      nodeType: meta.nodeType,
      inCurrentGraph: meta.inCurrentGraph,
      isHistorical: !meta.inCurrentGraph,
      status,
      errorCode,
      errorClass,
      errorMessage,
      errorSummary: errorMessage || errorClass || errorCode || status || '执行异常',
      errorCount,
      errorShareRate: dbRate(errorCount, errorNodeExecutions),
      triggerCount,
      affectedTriggers: triggerCount,
      conversationCount,
      affectedConversations: conversationCount,
      lastOccurredAt,
      sampleConversationId,
      sampleTriggerMessageId,
      occurrences
    };
  });

  const e2eMaxMs = Number(lat.e2e_max_ms || 0);
  const replyMaxMs = Number(lat.reply_max_ms || 0);

  return {
    workflow: workflow ? {
      id: String(workflow.id || workflow.workflow_id || ''),
      name: String(workflow.name || ''),
      status: workflow.status ?? '',
      publishVersion: workflow.publish_version ?? ''
    } : null,
    timeRange: {
      startTime: String(startTime || ''),
      endTime: String(endTime || '')
    },
    overview: {
      totalConversations,
      totalTriggers,
      totalUserMessages,
      executedTriggers,
      repliedTriggers,
      replyTriggerRate: dbRate(repliedTriggers, totalTriggers),
      noReplyTriggers,
      pendingTriggers,
      errorConversations,
      conversationErrorRate: dbRate(errorConversations, totalConversations),
      errorTriggers,
      triggerErrorRate: dbRate(errorTriggers, totalTriggers),
      totalNodeExecutions,
      errorNodeExecutions,
      nodeErrorRate: dbRate(errorNodeExecutions, totalNodeExecutions),
      dailyTrend: dailySeries
    },
    latency: {
      endToEnd: {
        count: Number(lat.e2e_count || 0),
        avgMs: Number(lat.e2e_avg_ms || 0),
        p50Ms: Number(lat.e2e_p50_ms || 0),
        p95Ms: Number(lat.e2e_p95_ms || 0),
        maxMs: e2eMaxMs,
        slowestSample: lat.slowest_e2e_trigger_id ? {
          conversationId: String(lat.slowest_e2e_conversation_id || ''),
          triggerMessageId: String(lat.slowest_e2e_trigger_id || ''),
          durationMs: e2eMaxMs
        } : null
      },
      reply: {
        count: Number(lat.reply_count || 0),
        avgMs: Number(lat.reply_avg_ms || 0),
        p50Ms: Number(lat.reply_p50_ms || 0),
        p95Ms: Number(lat.reply_p95_ms || 0),
        maxMs: replyMaxMs,
        slowestSample: lat.slowest_reply_trigger_id ? {
          conversationId: String(lat.slowest_reply_conversation_id || ''),
          triggerMessageId: String(lat.slowest_reply_trigger_id || ''),
          durationMs: replyMaxMs
        } : null
      },
      nodes: latencyNodes
    },
    branches: {
      flowGraph,
      conditionNodes,
      allNodes
    },
    errors: {
      totalErrorExecutions: errorNodeExecutions,
      items: errorsList
    },
    operations: {
      funnel: {
        stages: funnelStages,
        conditionSteps: conditionFunnelSteps
      },
      noReplyAttribution: {
        totalNoReply: totalNoReplyWithPending,
        reasons: noReplyReasons,
        silentBranches
      },
      conversationDepth,
      timeActivity
    }
  };
}

async function queryDbWorkflowAnalytics(url) {
  const configId = url.searchParams.get('configId') || '';
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  if (!workflowId) {
    const err = new Error('工作流ID为必填项');
    err.statusCode = 400;
    throw err;
  }
  const startTime = dbDateParam(url.searchParams.get('startTime'));
  const endTime = dbDateParam(url.searchParams.get('endTime'), true);
  if (!startTime || !endTime) {
    const err = new Error('学员消息时间为必填项');
    err.statusCode = 400;
    throw err;
  }
  const startDay = dbDateRangeTimestamp(startTime);
  const endDay = dbDateRangeTimestamp(endTime);
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) {
    const err = new Error('学员消息时间无效');
    err.statusCode = 400;
    throw err;
  }
  if ((endDay + 1000 - startDay) / 86400000 > 15) {
    const err = new Error('学员消息时间最多15天');
    err.statusCode = 400;
    throw err;
  }
  return withDbClient(configId, async client => {
    const endExclusive = new Date(endDay + 1000).toISOString().slice(0, 19).replace('T', ' ');
    const workflowResult = await client.query(
      'SELECT id, name, status, publish_version, graph_json FROM public.workflow WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [workflowId]
    );
    const analyticsSql = `
      WITH active_messages AS MATERIALIZED (
        SELECT m.conversation_id,
               NULLIF(BTRIM(m.event_id COLLATE "default"), '') AS trigger_message_id,
               m.message_timestamp
        FROM public.conversation_messages m
        WHERE m.workflow_id = $1
          AND m.deleted_at IS NULL
          AND UPPER(COALESCE(m.role, '')) = 'USER'
          AND m.message_timestamp >= $2
          AND m.message_timestamp < $3
      ),
      active_triggers AS MATERIALIZED (
        SELECT DISTINCT ON (trigger_message_id)
               trigger_message_id,
               conversation_id,
               message_timestamp
        FROM active_messages
        WHERE trigger_message_id IS NOT NULL
        ORDER BY trigger_message_id, message_timestamp ASC NULLS LAST
      ),
      execs AS MATERIALIZED (
        SELECT e.id,
               e.event_id AS trigger_message_id,
               t.conversation_id,
               COALESCE(NULLIF(BTRIM(e.node_id), ''), COALESCE(NULLIF(BTRIM(e.node_name), ''), 'unknown')) AS node_id,
               COALESCE(NULLIF(BTRIM(e.node_name), ''), COALESCE(NULLIF(BTRIM(e.node_id), ''), '未命名节点')) AS node_name,
               COALESCE(NULLIF(BTRIM(e.node_type), ''), 'unknown') AS node_type,
               COALESCE(NULLIF(BTRIM(e.status), ''), '') AS status,
               COALESCE(NULLIF(BTRIM(e.error_message), ''), '') AS error_message,
               COALESCE(NULLIF(BTRIM(e.error_class), ''), '') AS error_class,
               COALESCE(NULLIF(BTRIM(e.error_code), ''), '') AS error_code,
               (
                 COALESCE(BTRIM(e.error_message), '') <> ''
                 OR COALESCE(BTRIM(e.error_class), '') <> ''
                 OR COALESCE(BTRIM(e.error_code), '') <> ''
                 OR (
                   COALESCE(BTRIM(e.status), '') <> ''
                   AND UPPER(BTRIM(e.status)) NOT IN ('SUCCESS', 'COMPLETED')
                 )
               ) AS is_error,
               (
                 e.node_type = 'lingxi_send'
                 AND e.inputs::text ILIKE '%actionType%'
                 AND e.inputs::text ILIKE '%actionContent%'
                 AND e.inputs::text ILIKE '%6%'
               ) AS is_reply_send,
               CASE
                 WHEN e.node_type = 'condition' AND e.outputs IS NOT NULL AND BTRIM(e.outputs::text) LIKE '{%'
                   THEN jsonb_build_object(
                     'matchedBranchInfo', e.outputs::jsonb -> 'matchedBranchInfo',
                     'matchedBranches', e.outputs::jsonb -> 'matchedBranches',
                     'matchedBranch', e.outputs::jsonb -> 'matchedBranch'
                   )::text
                 ELSE NULL
               END AS condition_output,
               e.started_at,
               e.completed_at,
               GREATEST(COALESCE(e.duration_ms, 0), 0)::bigint AS duration_ms
        FROM active_triggers t
        JOIN public.workflow_node_executions e
          ON e.workflow_id = $1
         AND e.event_id = t.trigger_message_id
         AND e.deleted_at IS NULL
      ),
      overview_stats AS (
        SELECT
          (SELECT COUNT(DISTINCT conversation_id) FROM active_messages) AS total_conversations,
          (SELECT COUNT(*) FROM active_triggers) AS total_triggers,
          COUNT(DISTINCT trigger_message_id) AS executed_triggers,
          COUNT(DISTINCT trigger_message_id) FILTER (WHERE is_reply_send AND NOT is_error) AS replied_triggers,
          COUNT(DISTINCT conversation_id) FILTER (WHERE is_error) AS error_conversations,
          COUNT(DISTINCT trigger_message_id) FILTER (WHERE is_error) AS error_triggers,
          COUNT(*) AS total_node_executions,
          COUNT(*) FILTER (WHERE is_error) AS error_node_executions
        FROM execs
      ),
      trigger_spans AS (
        SELECT
          trigger_message_id,
          conversation_id,
          COALESCE(
            MIN(started_at) FILTER (WHERE node_type = 'lingxi_trigger' OR node_name = '灵犀触发器'),
            MIN(started_at)
          ) AS trigger_started_at,
          MAX(
            COALESCE(
              completed_at,
              started_at + (duration_ms * INTERVAL '1 millisecond')
            )
          ) AS last_completed_at,
          MAX(
            COALESCE(
              completed_at,
              started_at + (duration_ms * INTERVAL '1 millisecond')
            )
          ) FILTER (WHERE is_reply_send AND NOT is_error) AS reply_completed_at,
          SUM(duration_ms)::bigint AS sum_duration_ms,
          BOOL_OR(is_reply_send AND NOT is_error) AS has_reply,
          BOOL_OR(is_error) AS has_error,
          BOOL_OR(node_type = 'condition') AS has_condition,
          (ARRAY_AGG(node_id ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS last_node_id,
          (ARRAY_AGG(node_name ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS last_node_name,
          (ARRAY_AGG(node_type ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS last_node_type,
          (ARRAY_AGG(node_id ORDER BY started_at DESC NULLS LAST, id DESC) FILTER (WHERE node_type = 'condition'))[1] AS last_cond_node_id,
          (ARRAY_AGG(node_name ORDER BY started_at DESC NULLS LAST, id DESC) FILTER (WHERE node_type = 'condition'))[1] AS last_cond_node_name,
          (ARRAY_AGG(condition_output ORDER BY started_at DESC NULLS LAST, id DESC) FILTER (WHERE node_type = 'condition'))[1] AS last_cond_output
        FROM execs
        GROUP BY trigger_message_id, conversation_id
      ),
      trigger_latencies AS (
        SELECT
          trigger_message_id,
          conversation_id,
          CASE
            WHEN last_completed_at IS NOT NULL AND trigger_started_at IS NOT NULL AND last_completed_at > trigger_started_at
              THEN ROUND(EXTRACT(EPOCH FROM (last_completed_at - trigger_started_at)) * 1000)::bigint
            ELSE sum_duration_ms
          END AS e2e_ms,
          CASE
            WHEN has_reply AND reply_completed_at IS NOT NULL AND trigger_started_at IS NOT NULL AND reply_completed_at >= trigger_started_at
              THEN ROUND(EXTRACT(EPOCH FROM (reply_completed_at - trigger_started_at)) * 1000)::bigint
            WHEN has_reply
              THEN sum_duration_ms
            ELSE NULL
          END AS reply_ms
        FROM trigger_spans
      ),
      latency_stats AS (
        SELECT
          COUNT(*) AS e2e_count,
          COALESCE(ROUND(AVG(e2e_ms))::bigint, 0) AS e2e_avg_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e2e_ms))::bigint, 0) AS e2e_p50_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e2e_ms))::bigint, 0) AS e2e_p95_ms,
          COALESCE(MAX(e2e_ms), 0) AS e2e_max_ms,
          (ARRAY_AGG(conversation_id ORDER BY e2e_ms DESC NULLS LAST, trigger_message_id))[1] AS slowest_e2e_conversation_id,
          (ARRAY_AGG(trigger_message_id ORDER BY e2e_ms DESC NULLS LAST, trigger_message_id))[1] AS slowest_e2e_trigger_id,
          COUNT(reply_ms) AS reply_count,
          COALESCE(ROUND(AVG(reply_ms))::bigint, 0) AS reply_avg_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY reply_ms))::bigint, 0) AS reply_p50_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY reply_ms))::bigint, 0) AS reply_p95_ms,
          COALESCE(MAX(reply_ms), 0) AS reply_max_ms,
          (ARRAY_AGG(conversation_id ORDER BY reply_ms DESC NULLS LAST, trigger_message_id) FILTER (WHERE reply_ms IS NOT NULL))[1] AS slowest_reply_conversation_id,
          (ARRAY_AGG(trigger_message_id ORDER BY reply_ms DESC NULLS LAST, trigger_message_id) FILTER (WHERE reply_ms IS NOT NULL))[1] AS slowest_reply_trigger_id
        FROM trigger_latencies
      ),
      node_stats AS (
        SELECT
          node_id,
          (ARRAY_AGG(node_name ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS node_name,
          (ARRAY_AGG(node_type ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS node_type,
          COUNT(*) AS execution_count,
          COUNT(DISTINCT trigger_message_id) AS trigger_count,
          COUNT(DISTINCT conversation_id) AS conversation_count,
          COUNT(*) FILTER (WHERE is_error) AS error_count,
          COALESCE(ROUND(AVG(duration_ms))::bigint, 0) AS avg_duration_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms))::bigint, 0) AS p50_duration_ms,
          COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::bigint, 0) AS p95_duration_ms,
          COALESCE(MAX(duration_ms), 0) AS max_duration_ms,
          (ARRAY_AGG(conversation_id ORDER BY duration_ms DESC NULLS LAST, started_at DESC NULLS LAST, id DESC))[1] AS slowest_conversation_id,
          (ARRAY_AGG(trigger_message_id ORDER BY duration_ms DESC NULLS LAST, started_at DESC NULLS LAST, id DESC))[1] AS slowest_trigger_id
        FROM execs
        GROUP BY node_id
      ),
      condition_stats AS (
        SELECT
          node_id,
          (ARRAY_AGG(node_name ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS node_name,
          condition_output,
          COUNT(*) AS execution_count,
          COUNT(DISTINCT trigger_message_id) AS trigger_count
        FROM execs
        WHERE node_type = 'condition'
        GROUP BY node_id, condition_output
      ),
      condition_time_stats AS (
        SELECT
          node_id,
          CASE
            WHEN ($3::timestamp - $2::timestamp) <= INTERVAL '36 hours'
              THEN TO_CHAR(COALESCE(started_at, completed_at), 'MM-DD HH24:00')
            ELSE TO_CHAR(COALESCE(started_at, completed_at), 'YYYY-MM-DD')
          END AS time_bucket,
          condition_output,
          COUNT(*) AS execution_count,
          COUNT(DISTINCT trigger_message_id) AS trigger_count
        FROM execs
        WHERE node_type = 'condition'
          AND COALESCE(started_at, completed_at) IS NOT NULL
        GROUP BY node_id, time_bucket, condition_output
      ),
      no_reply_stats AS (
        SELECT
          CASE
            WHEN has_error THEN 'error_interrupted'
            WHEN has_condition THEN 'condition_silent'
            ELSE 'normal_no_send'
          END AS reason_type,
          last_cond_node_id AS cond_node_id,
          last_cond_node_name AS cond_node_name,
          last_cond_output AS cond_output,
          COUNT(*) AS trigger_count,
          COUNT(DISTINCT conversation_id) AS conversation_count,
          (ARRAY_AGG(conversation_id ORDER BY trigger_started_at DESC NULLS LAST, trigger_message_id))[1] AS sample_conversation_id,
          (ARRAY_AGG(trigger_message_id ORDER BY trigger_started_at DESC NULLS LAST, trigger_message_id))[1] AS sample_trigger_id,
          jsonb_agg(
            jsonb_build_object(
              'conversation_id', conversation_id,
              'trigger_id', trigger_message_id,
              'occurred_at', COALESCE(trigger_started_at, last_completed_at),
              'duration_ms', sum_duration_ms,
              'last_node_id', last_node_id,
              'last_node_name', last_node_name,
              'last_node_type', last_node_type,
              'cond_node_id', last_cond_node_id,
              'cond_node_name', last_cond_node_name,
              'cond_output', last_cond_output
            )
            ORDER BY trigger_started_at DESC NULLS LAST, trigger_message_id DESC
          ) AS occurrences
        FROM trigger_spans
        WHERE NOT has_reply
        GROUP BY reason_type, last_cond_node_id, last_cond_node_name, last_cond_output
      ),
      daily_trend_stats AS (
        SELECT
          TO_CHAR(t.message_timestamp, 'YYYY-MM-DD') AS day_date,
          COUNT(DISTINCT t.conversation_id) AS conversation_count,
          COUNT(*) AS trigger_count,
          COUNT(*) FILTER (WHERE COALESCE(ts.has_reply, false)) AS replied_count,
          COUNT(*) FILTER (WHERE COALESCE(ts.has_error, false)) AS error_trigger_count,
          COUNT(DISTINCT t.conversation_id) FILTER (WHERE COALESCE(ts.has_error, false)) AS error_conversation_count
        FROM active_triggers t
        LEFT JOIN trigger_spans ts ON ts.trigger_message_id = t.trigger_message_id
        WHERE t.message_timestamp IS NOT NULL
        GROUP BY day_date
        ORDER BY day_date ASC
      ),
      conv_turn_counts AS (
        SELECT
          conversation_id,
          COUNT(*) AS turn_count,
          (ARRAY_AGG(trigger_message_id ORDER BY message_timestamp DESC NULLS LAST))[1] AS last_trigger_id
        FROM active_triggers
        GROUP BY conversation_id
      ),
      conv_depth_stats AS (
        SELECT
          COUNT(*) AS total_convs,
          COUNT(*) FILTER (WHERE turn_count = 1) AS turns_1,
          COUNT(*) FILTER (WHERE turn_count BETWEEN 2 AND 3) AS turns_2_3,
          COUNT(*) FILTER (WHERE turn_count BETWEEN 4 AND 6) AS turns_4_6,
          COUNT(*) FILTER (WHERE turn_count >= 7) AS turns_7_plus,
          COALESCE(ROUND(AVG(turn_count)::numeric, 1), 0) AS avg_turns,
          COALESCE(MAX(turn_count), 0) AS max_turns,
          (ARRAY_AGG(conversation_id ORDER BY turn_count DESC, conversation_id))[1] AS top_conversation_id,
          (ARRAY_AGG(last_trigger_id ORDER BY turn_count DESC, conversation_id))[1] AS top_trigger_id
        FROM conv_turn_counts
      ),
      hourly_activity_stats AS (
        SELECT
          EXTRACT(HOUR FROM t.message_timestamp)::int AS hour_of_day,
          COUNT(*) AS trigger_count,
          COUNT(DISTINCT t.conversation_id) AS conversation_count,
          COUNT(*) FILTER (WHERE COALESCE(ts.has_reply, false)) AS replied_count,
          COUNT(*) FILTER (WHERE COALESCE(ts.has_error, false)) AS error_count
        FROM active_triggers t
        LEFT JOIN trigger_spans ts ON ts.trigger_message_id = t.trigger_message_id
        WHERE t.message_timestamp IS NOT NULL
        GROUP BY hour_of_day
        ORDER BY hour_of_day ASC
      ),
      error_stats AS (
        SELECT
          node_id,
          (ARRAY_AGG(node_name ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS node_name,
          (ARRAY_AGG(node_type ORDER BY started_at DESC NULLS LAST, id DESC))[1] AS node_type,
          status,
          error_code,
          error_class,
          LEFT(error_message, 300) AS error_message,
          COUNT(*) AS error_count,
          COUNT(DISTINCT trigger_message_id) AS trigger_count,
          COUNT(DISTINCT conversation_id) AS conversation_count,
          MAX(COALESCE(completed_at, started_at)) AS last_occurred_at,
          (ARRAY_AGG(conversation_id ORDER BY COALESCE(completed_at, started_at) DESC NULLS LAST, id DESC))[1] AS sample_conversation_id,
          (ARRAY_AGG(trigger_message_id ORDER BY COALESCE(completed_at, started_at) DESC NULLS LAST, id DESC))[1] AS sample_trigger_id,
          jsonb_agg(
            jsonb_build_object(
              'execution_id', id,
              'conversation_id', conversation_id,
              'trigger_id', trigger_message_id,
              'occurred_at', COALESCE(completed_at, started_at),
              'duration_ms', duration_ms,
              'error_message', LEFT(error_message, 500)
            )
            ORDER BY COALESCE(completed_at, started_at) DESC NULLS LAST, id DESC
          ) AS occurrences
        FROM execs
        WHERE is_error
        GROUP BY node_id, status, error_code, error_class, LEFT(error_message, 300)
        ORDER BY error_count DESC, last_occurred_at DESC NULLS LAST
        LIMIT 30
      )
      SELECT
        (SELECT row_to_json(overview_stats) FROM overview_stats) AS overview,
        (SELECT row_to_json(latency_stats) FROM latency_stats) AS latency,
        COALESCE((SELECT json_agg(row_to_json(node_stats)) FROM node_stats), '[]'::json) AS nodes,
        COALESCE((SELECT json_agg(row_to_json(condition_stats)) FROM condition_stats), '[]'::json) AS conditions,
        COALESCE((SELECT json_agg(row_to_json(condition_time_stats)) FROM condition_time_stats), '[]'::json) AS condition_time_stats,
        COALESCE((SELECT json_agg(row_to_json(no_reply_stats)) FROM no_reply_stats), '[]'::json) AS no_reply_stats,
        (SELECT row_to_json(conv_depth_stats) FROM conv_depth_stats) AS conv_depth,
        COALESCE((SELECT json_agg(row_to_json(hourly_activity_stats)) FROM hourly_activity_stats), '[]'::json) AS hourly_activity,
        COALESCE((SELECT json_agg(row_to_json(daily_trend_stats)) FROM daily_trend_stats), '[]'::json) AS daily_trend,
        COALESCE((SELECT json_agg(row_to_json(error_stats)) FROM error_stats), '[]'::json) AS errors
    `;
    const statsRow = (await client.query(analyticsSql, [workflowId, startTime, endExclusive])).rows[0] || {};
    return buildDbWorkflowAnalytics({
      workflow: workflowResult.rows[0] || { id: workflowId, name: '' },
      startTime,
      endTime,
      overview: statsRow.overview || {},
      latency: statsRow.latency || {},
      nodes: statsRow.nodes || [],
      conditions: statsRow.conditions || [],
      conditionTimeStats: statsRow.condition_time_stats || [],
      noReplyStats: statsRow.no_reply_stats || [],
      convDepth: statsRow.conv_depth || {},
      hourlyActivity: statsRow.hourly_activity || [],
      dailyTrend: statsRow.daily_trend || [],
      errors: statsRow.errors || []
    });
  });
}

async function dbConversationConfigIdForRoute(workflowId, conversationId) {
  const configs = readDbConfigs();
  if (!configs.length) {
    const err = new Error('请先配置数据库连接');
    err.statusCode = 400;
    throw err;
  }
  const activeConfigId = dbConnectionStatus().configId;
  const candidates = [
    ...configs.filter(config => config.id === activeConfigId),
    ...configs.filter(config => config.id !== activeConfigId)
  ];
  const { Pool } = requirePg();
  for (const config of candidates) {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 1,
      connectionTimeoutMillis: 5000
    });
    try {
      const result = await pool.query(
        'SELECT 1 FROM public.conversation_messages WHERE workflow_id = $1 AND conversation_id = $2 AND deleted_at IS NULL LIMIT 1',
        [workflowId, conversationId]
      );
      if (result.rowCount) return config.id;
    } catch {
      // A stale or unavailable alternative configuration must not prevent the
      // currently selected database from opening its own detail page.
    } finally {
      await pool.end().catch(() => {});
    }
  }
  return activeConfigId || configs[0].id;
}

async function dbConversationDetail(url) {
  const requestedConfigId = String(url.searchParams.get('configId') || '').trim();
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  const conversationId = String(url.searchParams.get('conversationId') || '').trim();
  if (!workflowId || !conversationId) {
    const err = new Error('缺少 workflowId 或 conversationId');
    err.statusCode = 400;
    throw err;
  }
  const configId = requestedConfigId || await dbConversationConfigIdForRoute(workflowId, conversationId);
  return withDbClient(configId, async client => {
    const [workflow, messages, variables] = await Promise.all([
      client.query('SELECT * FROM public.workflow WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [workflowId]),
      client.query(`
        SELECT m.*,
               m.event_id AS trigger_message_id,
               NULLIF(BTRIM(cm.raw_data ->> 'friendNick'), '') AS channel_friend_nick
        FROM public.conversation_messages m
        LEFT JOIN LATERAL (
          SELECT c.raw_data
          FROM public.channel_messages c
          WHERE c.event_id = (m.event_id COLLATE "default")
            AND c.deleted_at IS NULL
          ORDER BY c.id DESC
          LIMIT 1
        ) cm ON TRUE
        WHERE m.workflow_id = $1
          AND m.conversation_id = $2
          AND m.deleted_at IS NULL
        ORDER BY m.message_timestamp ASC NULLS LAST, m.id ASC
      `, [workflowId, conversationId]),
      client.query(`
        SELECT DISTINCT ON (cv.variable_key)
               cv.*,
               wvd.description AS variable_description
        FROM public.conversation_variables cv
        LEFT JOIN public.workflow_variable_definition wvd
          ON wvd.workflow_id = cv.workflow_id
         AND wvd.variable_key = cv.variable_key
         AND wvd.deleted_at IS NULL
        WHERE cv.workflow_id = $1
          AND cv.conversation_id = $2
          AND cv.deleted_at IS NULL
        ORDER BY cv.variable_key, cv.updated_at DESC NULLS LAST, cv.id DESC
      `, [workflowId, conversationId])
    ]);
    const triggerIds = [...new Set(messages.rows.map(dbTriggerIdOf).filter(Boolean))];
    const temporalWorkflowId = `platform:${workflowId}:${conversationId}`;
    const executionWhereClause = triggerIds.length
      ? 'e.event_id = ANY($2::varchar[])'
      : '(e.temporal_workflow_id = $2 OR e.conversation_id = $3)';
    const executionParams = triggerIds.length
      ? [workflowId, triggerIds]
      : [workflowId, temporalWorkflowId, conversationId];
    const executions = (await client.query(`
      SELECT e.id,
             e.workflow_id,
             e.event_id,
             e.event_id AS trigger_message_id,
             e.temporal_workflow_id,
             e.temporal_workflow_id AS run_id,
             e.node_id,
             e.node_type,
             e.node_name,
             CASE WHEN e.node_type IN ('lingxi_send', 'set_variable', 'lingxi_trigger') OR e.node_name = '灵犀触发器' THEN e.inputs ELSE NULL END AS inputs,
             CASE WHEN e.node_type = 'lingxi_send' THEN e.logs ELSE NULL END AS logs,
             CASE
               WHEN e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器'
                 THEN jsonb_build_object('input', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'input', 'friendNick', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'friendNick', 'latestMsgTime', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'latestMsgTime', 'inputList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputList', 'inputMessageList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputMessageList', 'inputListMessageList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'inputListMessageList', 'tagList', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'tagList', 'lingxiAccount', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'lingxiAccount', 'friendRemoteId', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'friendRemoteId', 'conversationType', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'conversationType', 'chatRoomName', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'chatRoomName', 'chatRoomWxId', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'chatRoomWxId', 'chatRoomRemoteId', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'chatRoomRemoteId', 'eventContent', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'eventContent', 'eventSourceType', ${DB_TRIGGER_EFFECTIVE_OUTPUTS_SQL} -> 'eventSourceType')
               WHEN e.node_type = 'agent'
                 THEN jsonb_build_object('output', e.outputs::jsonb -> 'output')
               WHEN e.node_type IN ('condition', 'set_variable')
                 THEN e.outputs
               ELSE NULL
             END AS outputs,
             e.status,
             e.error_message,
             e.error_class,
             e.error_code,
             e.started_at,
             e.completed_at,
             e.duration_ms
      FROM public.workflow_node_executions e
      ${DB_TRIGGER_CHANNEL_FALLBACK_JOIN}
      WHERE e.workflow_id = $1
        AND e.deleted_at IS NULL
        AND ${executionWhereClause}
      ORDER BY e.started_at ASC NULLS LAST, e.id ASC
    `, executionParams)).rows;
    const referencedNodeIds = dbReferencedOutputNodeIds(executions);
    if (referencedNodeIds.length && triggerIds.length) {
      const referencedOutputs = (await client.query(`
        SELECT e.event_id,
               e.event_id AS trigger_message_id,
               e.node_id,
               e.outputs
        FROM public.workflow_node_executions e
        WHERE e.workflow_id = $1
          AND e.event_id = ANY($2::varchar[])
          AND e.node_id = ANY($3::varchar[])
          AND e.deleted_at IS NULL
      `, [workflowId, triggerIds, referencedNodeIds])).rows;
      const outputsByNode = new Map(referencedOutputs.map(item => [
        `${dbTriggerIdOf(item)}\n${dbNodeIdOf(item)}`,
        item.outputs
      ]));
      executions.forEach(execution => {
        const outputs = outputsByNode.get(`${dbTriggerIdOf(execution)}\n${dbNodeIdOf(execution)}`);
        if (outputs !== undefined) execution.outputs = outputs;
      });
    }
    return {
      ...buildDbConversationDetail({
      workflow: workflow.rows[0] || null,
      messages: messages.rows,
      variables: variables.rows,
      executions
      }),
      configId
    };
  }, { allowConnect: !requestedConfigId });
}

async function dbConversationNodeExecution(url) {
  const configId = url.searchParams.get('configId') || '';
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  const triggerMessageId = String(url.searchParams.get('triggerMessageId') || '').trim();
  const executionId = String(url.searchParams.get('executionId') || '').trim();
  if (!workflowId || !triggerMessageId || !executionId) {
    const err = new Error('缺少 workflowId、triggerMessageId 或 executionId');
    err.statusCode = 400;
    throw err;
  }
  return withDbClient(configId, async client => {
    const execution = await client.query(`
      SELECT e.*,
             e.event_id AS trigger_message_id,
             e.temporal_workflow_id AS run_id,
             CASE
               WHEN (e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器')
                 AND (e.outputs IS NULL OR e.outputs::jsonb = '{}'::jsonb)
                 AND cm.raw_data IS NOT NULL
                 THEN cm.raw_data
               ELSE e.outputs
             END AS outputs
      FROM public.workflow_node_executions e
      ${DB_TRIGGER_CHANNEL_FALLBACK_JOIN}
      WHERE e.id = $1
        AND e.workflow_id = $2
        AND e.event_id = $3
        AND e.deleted_at IS NULL
      LIMIT 1
    `, [executionId, workflowId, triggerMessageId]);
    if (!execution.rows[0]) {
      const err = new Error('节点执行记录不存在');
      err.statusCode = 404;
      throw err;
    }
    return { execution: normalizeDbExecution(execution.rows[0], {}, { includeDetails: true }) };
  });
}

async function dbConversationHistoricalNode(url) {
  const configId = url.searchParams.get('configId') || '';
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  const triggerMessageId = String(url.searchParams.get('triggerMessageId') || '').trim();
  const nodeId = String(url.searchParams.get('nodeId') || '').trim();
  if (!workflowId || !triggerMessageId || !nodeId) {
    const err = new Error('缺少 workflowId、triggerMessageId 或 nodeId');
    err.statusCode = 400;
    throw err;
  }
  return withDbClient(configId, async client => {
    const [workflow, executionResult] = await Promise.all([
      client.query('SELECT id, graph_json FROM public.workflow WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [workflowId]),
      client.query(`
        SELECT e.*,
               e.event_id AS trigger_message_id,
               e.temporal_workflow_id AS run_id
        FROM public.workflow_node_executions e
        WHERE e.workflow_id = $1
          AND e.event_id = $2
          AND e.deleted_at IS NULL
        ORDER BY e.started_at ASC NULLS LAST, e.id ASC
      `, [workflowId, triggerMessageId])
    ]);
    const currentGraph = parseDbJson(workflow.rows[0]?.graph_json, { nodes: [], edges: [] }) || { nodes: [], edges: [] };
    if ((currentGraph.nodes || []).some(node => String(node.id) === nodeId)) {
      return { historicalRuntime: null };
    }
    const workflowVersions = await dbWorkflowVersionsForHistoricalNodes(client, workflowId, currentGraph, executionResult.rows);
    const historicalRuntime = dbHistoricalNodesByTrigger({
      currentGraph,
      workflowVersions,
      executions: executionResult.rows
    })[triggerMessageId] || null;
    return { historicalRuntime };
  });
}

async function dbConversationVariables(url) {
  const configId = url.searchParams.get('configId') || '';
  const workflowId = String(url.searchParams.get('workflowId') || '').trim();
  const conversationId = String(url.searchParams.get('conversationId') || '').trim();
  if (!workflowId || !conversationId) {
    const err = new Error('缺少 workflowId 或 conversationId');
    err.statusCode = 400;
    throw err;
  }
  return withDbClient(configId, async client => {
    const variables = await client.query(`
      SELECT DISTINCT ON (cv.variable_key)
             cv.*,
             wvd.description AS variable_description
      FROM public.conversation_variables cv
      LEFT JOIN public.workflow_variable_definition wvd
        ON wvd.workflow_id = cv.workflow_id
       AND wvd.variable_key = cv.variable_key
       AND wvd.deleted_at IS NULL
      WHERE cv.workflow_id = $1
        AND cv.conversation_id = $2
        AND cv.deleted_at IS NULL
      ORDER BY cv.variable_key, cv.updated_at DESC NULLS LAST, cv.id DESC
    `, [workflowId, conversationId]);
    return { variables: normalizeDbConversationVariables(variables.rows) };
  });
}

async function fetchDbConversationExecutions(configId, workflowId, conversationId) {
  return withDbClient(configId, async client => {
    const triggerIds = (await client.query(
      "SELECT DISTINCT event_id AS trigger_message_id FROM public.conversation_messages WHERE workflow_id = $1 AND conversation_id = $2 AND deleted_at IS NULL",
      [workflowId, conversationId]
    )).rows.map(r => r.trigger_message_id).filter(Boolean);

    if (!triggerIds.length) return [];

    return (await client.query(`
      SELECT e.*,
             e.event_id AS trigger_message_id,
             e.temporal_workflow_id AS run_id,
             CASE
               WHEN (e.node_type = 'lingxi_trigger' OR e.node_name = '灵犀触发器')
                 AND (e.outputs IS NULL OR e.outputs::jsonb = '{}'::jsonb)
                 AND cm.raw_data IS NOT NULL
                 THEN cm.raw_data
               ELSE e.outputs
             END AS outputs
      FROM public.workflow_node_executions e
      ${DB_TRIGGER_CHANNEL_FALLBACK_JOIN}
      WHERE e.workflow_id = $1
        AND e.deleted_at IS NULL
        AND e.event_id = ANY($2::varchar[])
      ORDER BY e.started_at ASC NULLS LAST, e.id ASC
    `, [workflowId, triggerIds])).rows;
  });
}

async function sendDbConversationMessage(req) {
  const body = await parseBody(req);
  const configId = String(body.configId || "").trim();
  const workflowId = String(body.workflowId || "").trim();
  const conversationId = String(body.conversationId || "").trim();
  const message = String(body.message || "").trim();
  const agentId = String(body.agentId || "").trim();
  const mqConfigId = String(body.mqConfigId || "").trim();
  
  if (!workflowId || !conversationId || !message) {
    const err = new Error("缺少 workflowId、conversationId 或 message");
    err.statusCode = 400;
    throw err;
  }

  requireTestDbConversationConfig(configId);

  const configuredMqConfigs = readMqConfigs();
  if (!configuredMqConfigs.length) {
    const err = new Error('未配置 MQ，请前往系统设置完成 MQ 配置后再发送');
    err.statusCode = 400;
    throw err;
  }
  if (!mqConfigId) {
    const err = new Error('请选择 MQ 配置后再发送');
    err.statusCode = 400;
    throw err;
  }
  const selectedMqConfig = configuredMqConfigs.find(config => config.id === mqConfigId);
  if (!selectedMqConfig) {
    const err = new Error('所选 MQ 配置不存在或已被删除');
    err.statusCode = 400;
    throw err;
  }
  
  // Fetch executions from database
  const executions = await fetchDbConversationExecutions(configId, workflowId, conversationId);
  
  if (!executions.length) {
    const err = new Error("未找到该会话的执行记录");
    err.statusCode = 404;
    throw err;
  }
  
  // Prepare payload
  const payload = prepareDbConversationPayload({
    workflowId,
    conversationId,
    message,
    executions,
    agentId,
    mqConfigId
  });
  
  // Send via MQ
  const config = selectedMqConfig;
  const snapshot = {
    index: 1,
    role: "student",
    content: message,
    delaySeconds: 0,
    payload
  };
  
  const gateway = await checkMqGatewayReady(config);
  const sentSnapshot = gateway.ready
    ? { ...snapshot, mqResult: await sendSnapshotToMq(snapshot, config) }
    : { ...snapshot, mqResult: failedMqResult(gateway.error) };
  
  const summary = summarizeMqSend([sentSnapshot], gateway.ready);
  clearDbConversationCandidateCache();
  
  return {
    success: sentSnapshot.mqResult?.success || false,
    // The workflow persists this requestId as trigger_message_id. Returning it lets
    // the UI correlate the optimistic message with the exact database record.
    triggerMessageId: payload.requestId,
    snapshot: sentSnapshot,
    ...summary
  };
}
async function previewDbConversationPayload(url) {
  const configId = String(url.searchParams.get("configId") || "").trim();
  const workflowId = String(url.searchParams.get("workflowId") || "").trim();
  const conversationId = String(url.searchParams.get("conversationId") || "").trim();
  const message = String(url.searchParams.get("message") || "").trim();
  const agentId = String(url.searchParams.get("agentId") || "").trim();
  const mqConfigId = String(url.searchParams.get("mqConfigId") || "").trim();
  
  if (!workflowId || !conversationId || !message) {
    const err = new Error("缺少 workflowId、conversationId 或 message");
    err.statusCode = 400;
    throw err;
  }

  requireTestDbConversationConfig(configId);
  
  const executions = await fetchDbConversationExecutions(configId, workflowId, conversationId);
  
  if (!executions.length) {
    const err = new Error("未找到该会话的执行记录");
    err.statusCode = 404;
    throw err;
  }
  
  const payload = prepareDbConversationPayload({
    workflowId,
    conversationId,
    message,
    executions,
    agentId,
    mqConfigId
  });
  
  return { payload };
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
  payload.requestId = randomRequestId(
    String(payload.weworkCorpId || 'ww'),
    snapshots.length + 1,
    payload.weworkAccount,
    payload.friendRemoteId
  );
  synchronizeProtocolMessageLists(payload, [
    ...(Array.isArray(previousPayload.inputListMessageList) ? previousPayload.inputListMessageList : []),
    ...(Array.isArray(previousPayload.inputMessageList) ? previousPayload.inputMessageList : [])
  ]);
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
      c.message.lingxiAccount = row.lingxiAccount || c.message.lingxiAccount;
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
        sources: UPDATE_SOURCES.map(({ key, label, repository }) => ({ key, label, repository }))
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
    if (req.method === 'GET' && pathname === '/api/label-management') {
      return json(res, 200, labelManagementData());
    }
    if (req.method === 'POST' && pathname === '/api/label-management') {
      return json(res, 200, updateLabelManagement(await parseBody(req)));
    }
    if (req.method === 'POST' && pathname === '/api/label-management/batch-delete') {
      return json(res, 200, deleteLabelManagementItems(await parseBody(req)));
    }
    if (req.method === 'POST' && pathname === '/api/label-management/delete-unused') {
      return json(res, 200, deleteUnusedLabelManagementItems(await parseBody(req)));
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
    if (req.method === 'DELETE' && mqConfigMatch) {
      deleteMqConfig(decodeURIComponent(mqConfigMatch[1]));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && pathname === '/api/db-configs') {
      return json(res, 200, readDbConfigs().map(publicDbConfig));
    }
    if (req.method === 'POST' && pathname === '/api/db-configs') {
      return json(res, 201, saveDbConfig(await parseBody(req)));
    }
    const dbConfigMatch = pathname.match(/^\/api\/db-configs\/([^/]+)$/);
    if (req.method === 'PUT' && dbConfigMatch) {
      const body = await parseBody(req);
      body.id = decodeURIComponent(dbConfigMatch[1]);
      return json(res, 200, saveDbConfig(body));
    }
    if (req.method === 'DELETE' && dbConfigMatch) {
      await deleteDbConfig(decodeURIComponent(dbConfigMatch[1]));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/db-configs/test') {
      const body = await parseBody(req);
      return json(res, 200, await testDbConnection(body.configId));
    }
    if (req.method === 'GET' && pathname === '/api/db-configs/status') {
      return json(res, 200, dbConnectionStatus(url.searchParams.get('configId') || ''));
    }
    if (req.method === 'POST' && pathname === '/api/db-configs/connect') {
      const body = await parseBody(req);
      return json(res, 200, await connectDbConnection(body.configId || ''));
    }
    if (req.method === 'POST' && pathname === '/api/db-configs/switch') {
      const body = await parseBody(req);
      return json(res, 200, await connectDbConnection(body.configId || ''));
    }
    if (req.method === 'POST' && pathname === '/api/db-configs/disconnect') {
      const body = await parseBody(req);
      return json(res, 200, await disconnectDbConnection(body.configId || ''));
    }
    if (req.method === 'GET' && pathname === '/api/db-conversation-filters') {
      return json(res, 200, readDbConversationFilters().map(publicDbConversationFilter));
    }
    if (req.method === 'POST' && pathname === '/api/db-conversation-filters') {
      return json(res, 201, saveDbConversationFilter(await parseBody(req)));
    }
    const dbConversationFilterMatch = pathname.match(/^\/api\/db-conversation-filters\/([^/]+)$/);
    if (req.method === 'DELETE' && dbConversationFilterMatch) {
      deleteDbConversationFilter(decodeURIComponent(dbConversationFilterMatch[1]));
      return json(res, 204, {});
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations') {
      return json(res, 200, await listDbConversations(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/workflows') {
      return json(res, 200, await listDbWorkflows(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/analytics') {
      return json(res, 200, await queryDbWorkflowAnalytics(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations/detail') {
      return json(res, 200, await dbConversationDetail(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations/node-execution') {
      return json(res, 200, await dbConversationNodeExecution(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations/historical-node') {
      return json(res, 200, await dbConversationHistoricalNode(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations/variables') {
      return json(res, 200, await dbConversationVariables(url));
    }
    if (req.method === 'GET' && pathname === '/api/db/conversations/preview') {
      return json(res, 200, await previewDbConversationPayload(url));
    }
    if (req.method === 'POST' && pathname === '/api/db/conversations/send') {
      return json(res, 201, await sendDbConversationMessage(req));
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
  buildDbConversationDetail,
  buildDbConversationRows,
  buildDbWorkflowAnalytics,
  listDbWorkflows,
  queryDbWorkflowAnalytics,
  prepareDbConversationPayload,
  buildSnapshots,
  casesFromCsvText,
  checkMqGatewayReady,
  clearDbConversationCandidateCache,
  currentAppVersion,
  dbConfigRecord,
  ensureUpdateFilePermissions,
  getFallbackUpdateSource,
  isUpdateAllowedPath,
  publicDbConfig,
  saveDbConfig,
  sendSnapshotToMq,
  sendSnapshotsInOrder,
  summarizeMqSend,
  validateUpdateManifest,
  versionGreater
};
