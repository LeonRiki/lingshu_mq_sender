const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  buildSnapshots,
  casesFromCsvText,
  checkMqGatewayReady,
  getFallbackUpdateSource,
  isUpdateAllowedPath,
  sendSnapshotsInOrder,
  summarizeMqSend
} = require('../server');

test('更新包只包含运行所需文件与静态资源', () => {
  assert.equal(isUpdateAllowedPath('server.js'), true);
  assert.equal(isUpdateAllowedPath('web/detail-ui.js'), true);
  assert.equal(isUpdateAllowedPath('web/assets/github.png'), true);
  assert.equal(isUpdateAllowedPath('docs/消息流可视化构建需求.md'), false);
  assert.equal(isUpdateAllowedPath('test/mq-gateway.test.js'), false);
  assert.equal(isUpdateAllowedPath('scripts/generate-update-manifest.js'), false);
  assert.equal(isUpdateAllowedPath('web/detail-ui.jsx'), false);
  assert.equal(isUpdateAllowedPath('package-lock.json'), false);
});

test('GitHub 下载失败时切换到魔搭', () => {
  assert.equal(getFallbackUpdateSource({ key: 'github' })?.key, 'modelscope');
  assert.equal(getFallbackUpdateSource({ key: 'modelscope' }), null);
});

test('CSV 导入提取 input、skip_reason 与 modelName', () => {
  const cases = casesFromCsvText('input,skip_reason,modelName\n"第一条，含逗号","跳过原因","模型 A"\n"第二条\n含换行",,"模型 B"');
  assert.equal(cases.length, 2);
  assert.equal(cases[0].message.input[0], '第一条，含逗号');
  assert.equal(cases[0].meta.expectedResult, '跳过原因');
  assert.equal(cases[0].meta.businessScenario, '模型 A');
  assert.equal(cases[1].conversation.flow[0].content, '第二条\n含换行');
  assert.equal(cases[1].meta.businessScenario, '模型 B');
});

test('CSV 导入提取 history 与 tagList', () => {
  const [caseData] = casesFromCsvText('input,history,tagList\n测试消息,"[""teacher:历史一"",""teacher:历史二""]","标签一;标签二"');
  assert.deepEqual(caseData.message.inputList, ['teacher:历史一', 'teacher:历史二']);
  assert.deepEqual(caseData.message.tagList, ['标签一', '标签二']);
});

test('CSV 导入忽略线上身份与请求 ID 字段', () => {
  const [caseData] = casesFromCsvText('input,skip_reason,modelName,requestId,weworkCorpId,weworkAccount,externalId,friendNick\n测试消息,备注,模型,online-request,online-corp,online-account,online-friend,线上昵称');
  assert.equal(caseData.message.requestId, '');
  assert.equal(caseData.message.weworkCorpId, '');
  assert.equal(caseData.message.weworkAccount, '');
  assert.equal(caseData.message.friendExternalId, '');
  assert.equal(caseData.conversation.flow[0].attributes.requestId, undefined);
  assert.equal(caseData.conversation.flow[0].attributes.weworkAccount, undefined);
});

test('同一次多轮发送复用会话身份并为每条消息生成唯一 requestId', () => {
  const snapshots = buildSnapshots({
    message: { inputList: [], tagList: [] },
    session: { mode: 'perMessage', enabled: true, attributes: {} },
    conversation: {
      flow: [
        { type: 'message', content: 'first', attributes: { requestId: 'old-request', weworkAccount: 'old-account', weworkAccountAlias: 'alias-first', friendExternalId: 'old-friend', friendNick: 'nick-first' } },
        { type: 'delay', seconds: 1 },
        { type: 'message', content: 'second', attributes: { requestId: 'old-request', weworkAccount: 'old-account', weworkAccountAlias: 'alias-second', friendExternalId: 'old-friend', friendNick: 'nick-second' } }
      ]
    }
  }, { agentId: 'testId' });

  assert.equal(snapshots.length, 2);
  assert.notEqual(snapshots[0].payload.requestId, snapshots[1].payload.requestId);
  assert.equal(snapshots[0].payload.weworkAccount, snapshots[1].payload.weworkAccount);
  assert.equal(snapshots[0].payload.friendExternalId, snapshots[1].payload.friendExternalId);
  assert.notEqual(snapshots[0].payload.weworkAccount, snapshots[0].payload.friendExternalId);
  assert.notEqual(snapshots[0].payload.weworkAccount, 'old-account');
  assert.notEqual(snapshots[0].payload.friendExternalId, 'old-friend');
  assert.equal(snapshots[0].payload.weworkCorpId, snapshots[1].payload.weworkCorpId);
  assert.equal(snapshots[0].payload.weworkAccountAlias, snapshots[1].payload.weworkAccountAlias);
  assert.equal(snapshots[0].payload.weworkAccountAlias, 'alias-first');
  assert.equal(snapshots[0].payload.friendNick, snapshots[1].payload.friendNick);
  assert.equal(snapshots[0].payload.friendNick, 'nick-first');
});

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(JSON.parse(body)));
  });
}

test('按顺序调用 MQ 网关并记录发送结果', async () => {
  const requests = [];
  const gateway = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/mq/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ producers: ['ns-test_group-test'] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/mq/send') {
      requests.push(await readBody(req));
      const result = requests.length === 1
        ? { success: true, sendStatus: 'SEND_OK', msgId: 'msg-1', offsetMsgId: 'offset-1' }
        : { success: false, message: 'mock send failed' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => gateway.listen(0, resolve));
  const port = gateway.address().port;
  const config = {
    gatewayUrl: `http://127.0.0.1:${port}`,
    appId: 'app-test',
    topic: 'topic-test',
    producerGroup: 'group-test',
    secretKey: 'secret-test',
    nameServer: 'ns-test',
    messageType: 'ROCKETMQ_COMMON_TYPE'
  };

  try {
    assert.deepEqual(await checkMqGatewayReady(config), { ready: true, error: '' });
    const snapshots = await sendSnapshotsInOrder([
      { index: 1, delaySeconds: 0, payload: { requestId: 'request-1', input: ['first'] } },
      { index: 2, delaySeconds: 0, payload: { requestId: 'request-2', input: ['second'] } }
    ], config);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].keys, 'request-1');
    assert.deepEqual(JSON.parse(requests[0].messageBody), { requestId: 'request-1', input: ['first'] });
    assert.equal(requests[0].config.topic, 'topic-test');
    assert.equal(snapshots[0].mqResult.sendStatus, 'SEND_OK');
    assert.equal(snapshots[1].mqResult.success, false);
    assert.deepEqual(summarizeMqSend(snapshots), { status: '部分失败', successCount: 1, failCount: 1 });
  } finally {
    await new Promise(resolve => gateway.close(resolve));
  }
});
