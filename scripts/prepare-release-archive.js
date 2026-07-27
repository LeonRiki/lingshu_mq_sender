const os = require('os');
const path = require('path');

const { prepareReleaseArchive } = require('./prepare-release-package');

const outputDirectory = process.argv[2] || path.join(os.tmpdir(), `lingshu-mq-release-${Date.now()}`);
const result = prepareReleaseArchive(outputDirectory);

console.log(`已生成 v${result.version} Release 运行包，共 ${result.files.length} 个文件。`);
console.log(result.archivePath);
