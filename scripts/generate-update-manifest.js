const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isUpdateAllowedPath } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const output = path.join(ROOT, 'update-manifest.json');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function trackedFiles() {
  const result = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer' });
  return result.toString('utf8').split('\0').filter(Boolean);
}

const version = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version || '').trim();
if (!version) throw new Error('version.json 缺少 version');

const files = trackedFiles()
  .filter(file => isUpdateAllowedPath(file))
  .sort()
  .map(file => ({ path: file, sha256: sha256(path.join(ROOT, file)) }));

for (const required of ['server.js', 'version.json', 'web/detail-ui.js']) {
  if (!files.some(file => file.path === required)) throw new Error(`缺少必要更新文件：${required}`);
}

fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, version, notes: [], files }, null, 2)}\n`, 'utf8');
console.log(`已生成 ${path.relative(ROOT, output)}，包含 ${files.length} 个文件。`);
