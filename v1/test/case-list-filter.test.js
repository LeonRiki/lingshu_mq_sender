const assert = require('node:assert/strict');
const test = require('node:test');
const { matchesCaseFilters } = require('../web/case-list-filter');

const caseData = {
  meta: { name: '收集完整地址', businessScenario: '地址收集' },
  message: { input: ['请填写地址'], tagList: ['已填地址', '境外'] },
  conversation: { flow: [] }
};

test('文本搜索只匹配测试场景名称与触发消息', () => {
  assert.equal(matchesCaseFilters(caseData, { query: '地址收集', scenario: '', tags: [] }), false);
  assert.equal(matchesCaseFilters(caseData, { query: '完整地址', scenario: '', tags: [] }), true);
  assert.equal(matchesCaseFilters(caseData, { query: '填写地址', scenario: '', tags: [] }), true);
  assert.equal(matchesCaseFilters(caseData, { query: '已填地址', scenario: '', tags: [] }), false);
});

test('标签筛选要求用例同时包含全部选中标签', () => {
  assert.equal(matchesCaseFilters(caseData, { query: '', scenario: '', tags: ['已填地址', '境外'] }), true);
  assert.equal(matchesCaseFilters(caseData, { query: '', scenario: '', tags: ['已填地址', '不存在'] }), false);
  assert.equal(matchesCaseFilters(caseData, { query: '', scenario: '地址收集', tags: ['境外'] }), true);
});
