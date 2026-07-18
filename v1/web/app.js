const state = {
  config: null,
  fields: [],
  cases: [],
  records: [],
  activeCaseId: null,
  activeRecord: null,
  selectedCases: new Set(),
  attrTargetMessageId: null,
  selectedMessageId: null,
  contentEditMode: 'message',
  contentCaseId: null,
  editorOriginalCase: null,
  editorDirty: false,
  editorRevision: 0,
  sendTarget: null,
  mqConfigs: [],
  mqSettingsOpen: false,
  mqSettingsSelectedId: null,
  updateStatus: { currentVersion: '', sources: [], backups: [] },
  updateCheck: null,
  updateDialogOpen: false,
  casePage: 'list',
  recordPage: 'list',
  caseSearch: '',
  caseScenarioFilter: '',
  caseSort: { field: '', order: null },
  recordSearch: '',
  recordTriggerMessage: '',
  recordWeworkCorpId: '',
  recordFriendNick: '',
  casePageNo: 1,
  recordPageNo: 1,
  casePageSize: 20,
  recordPageSize: 15,
  actualRecords: [
    { input: '老师，领资料怎么领？', tags: '260501', reply: '' },
    { input: '快递到了吗？怎么还没收到', tags: '260501;已填地址', reply: '回复物流查询地址' },
    { input: '我完全是零基础，手抖得厉害，能学会吗', tags: '260501', reply: '' },
    { input: '现在在忙，晚点弄', tags: '260710;赠品单', reply: '打标签-待填地址' },
    { input: '我有工具了，不需要寄', tags: '260710;赠品单', reply: '劝说继续提供地址' }
  ]
};

const $ = (id) => document.getElementById(id);

function normalizeLabelItems(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((items, value) => {
    const name = String(typeof value === 'object' && value ? value.name : value || '').trim();
    if (!name || seen.has(name)) return items;
    seen.add(name);
    items.push({ name, status: value?.status === 'archived' ? 'archived' : 'active' });
    return items;
  }, []);
}

function normalizeConfigLabels(config) {
  return {
    ...(config || {}),
    userTags: normalizeLabelItems(config?.userTags),
    businessScenarios: normalizeLabelItems(config?.businessScenarios)
  };
}

function labelNames(type, status = 'active') {
  return normalizeLabelItems(state.config?.[type]).filter(item => item.status === status).map(item => item.name);
}

function labelManagementData() {
  const usageCount = (type, name) => state.cases.filter(c => type === 'userTags'
    ? (c.message.tagList || []).includes(name)
    : c.meta.businessScenario === name).length;
  return ['userTags', 'businessScenarios'].reduce((result, type) => {
    result[type] = normalizeLabelItems(state.config?.[type]).map(item => ({ ...item, usageCount: usageCount(type, item.name) }));
    return result;
  }, {});
}

const QUICK_INTENTS = {
  greeting: ['收到', '方便', '方便。', '可以的', '可以吧', '好的', '好的，老师', '你好', '嗯嗯', '我已添加了你，现在可以聊天了', '收到老师，明天我会参加学习的', '老师好，今天什么时候开始上课？'],
  order: ['老师，领资料怎么领？', '老师，你发资料我看看', '快递到了吗？怎么还没收到', '前天买的课本，还没收到信息', '老师直播间里的手稿资料怎样领', '看不到红卡片', '不是说可以免费领取整套书法资料吗？'],
  refund: ['这个课程不太适合我，能退款吗', '老师好，我想退一下课程', '老师，上了几节课觉得跟不上，可以退吗'],
  other: ['我没啥基础，先看看可以', '我完全是零基础，手抖得厉害，能学会吗', '我没有任何工具做画', '毛笔和墨汁在哪里买呀', '那个链接打不开，点进去黑屏了', '这个课要多少钱？是免费的吗', '能回放吗课程', '上课哪天开始？', '学啥的'],
  refuse_addr: ['我有工具了，不需要寄', '真的不需要，别再问了', '不用了，我自己买就行', '不需要寄东西，谢谢', '别给我寄了，我有', '不用发了', '我不需要发任何笔墨'],
  delay_addr: ['现在在忙，晚点弄', '等会儿填，我现在有点事', '晚点再发给你地址', '稍等，我在外面', '回头再弄这个', '晚点哈，现在不太方便', '正是吃饭时间，不太方便']
};

const QUICK_ADDRESS = {
  name: ['张三', '李四', '王五', '赵六', '陈七', '刘八', '杨九', '周十', '吴明', '郑华', '林芳', '黄丽'],
  phone: ['13800138001', '13900139002', '15000150003', '18600186004', '17700177005', '18800188006', '13600136007', '15900159008'],
  region: ['北京市朝阳区', '上海市浦东新区', '广州市天河区', '深圳市南山区', '杭州市西湖区', '成都市武侯区', '武汉市洪山区', '南京市鼓楼区'],
  detail: ['中关村大街1号创新大厦1203室', '望京SOHO T1-B座2206', '五道口华清嘉园8号楼3单元502', '珠江新城花城大道66号保利中心1801', '科技园南区高新大厦A座901', '未来科技城海创园5号楼2层', '西溪湿地旁天目山路388号', '建设路55号华联大厦1508']
};

const INTENT_LABELS = {
  greeting: '问候',
  order: '查订单',
  refund: '退款',
  other: '其他',
  refuse_addr: '拒绝填写地址',
  delay_addr: '推迟填写地址'
};

const ADDRESS_LABELS = { name: '姓名', phone: '手机号', region: '地区', detail: '详细地址' };

const QUICK_TAGS = ['已填地址', '待填地址', '不填地址', '有时间', '没时间', '赠品单'];

function toast(content, type = 'success') {
  if (window.showGlobalMessage) {
    window.showGlobalMessage(content, type);
    return;
  }
  (window.pendingGlobalMessages ||= []).push({ content, type });
}

function showError(error) {
  toast(error?.message || '操作失败，请重试', 'error');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败：${res.status}`);
  return data;
}

function parseTags(value) {
  return String(value || '')
    .split(/[,，;\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function tagsText(tags) {
  return Array.isArray(tags) ? tags.join('\n') : '';
}

function safeJsonParse(text, fallback) {
  try {
    const parsed = JSON.parse(text || '');
    return parsed;
  } catch (err) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function activeCase() {
  return state.cases.find(c => c.id === state.activeCaseId) || null;
}

function copyCaseData(value) {
  return JSON.parse(JSON.stringify(value));
}

function messageBatchCount(c) {
  const groups = messageFlowGroups(c?.conversation?.flow);
  if (groups.length) return groups.length;
  const legacyMessages = c?.conversation?.messages || [];
  if (legacyMessages.length) return legacyMessages.filter(message => (message.input || []).some(value => String(value || '').trim())).length;
  return 1;
}

function previewCaseInputs(c) {
  const flow = normalizeMessageFlow(c?.conversation?.flow);
  if (flow.length) return flow.filter(item => item.type === 'message').map(item => item.content);
  const legacyMessages = c?.conversation?.messages || [];
  if (legacyMessages.length) return legacyMessages.flatMap(message => message.input || []);
  return c?.message?.input || [];
}

function normalizeMessageFlow(flow) {
  const result = [];
  (Array.isArray(flow) ? flow : []).forEach(item => {
    if (item?.type === 'message') {
      const content = String(item.content ?? '').trim();
      if (content) result.push({
        id: item.id || `message_${Date.now()}_${result.length}`,
        type: 'message',
        content,
        attributes: item.attributes && typeof item.attributes === 'object' ? item.attributes : {}
      });
      return;
    }
    if (item?.type === 'delay' && result.length && result.at(-1).type === 'message') {
      const seconds = item.seconds === null || item.seconds === undefined || item.seconds === '' ? null : Number(item.seconds);
      result.push({ id: item.id || `delay_${Date.now()}_${result.length}`, type: 'delay', seconds: Number.isFinite(seconds) ? Math.max(0, seconds) : null });
    }
  });
  return result.at(-1)?.type === 'delay' ? result.slice(0, -1) : result;
}

function normalizeCase(c) {
  c.meta ||= {};
  c.message ||= {};
  c.session ||= {};
  c.conversation ||= {};
  c.meta.mode ||= 'single';
  c.meta.businessScenario ||= '';
  c.meta.expectedResult ||= '';
  c.message.input = Array.isArray(c.message.input) ? c.message.input : [''];
  c.message.inputList = Array.isArray(c.message.inputList) ? c.message.inputList : [];
  c.message.tagList = Array.isArray(c.message.tagList) ? c.message.tagList : [];
  c.message.agentId ||= state.config?.defaultAgentId || 'testId';
  c.session.mode ||= c.meta.mode === 'multi' ? 'system' : 'system';
  c.session.attributes ||= {};
  c.conversation.messages = Array.isArray(c.conversation.messages)
    ? c.conversation.messages.map(m => ({
      ...m,
      input: Array.isArray(m.input) ? m.input : (m.content ? [m.content] : []),
      attributes: m.attributes && typeof m.attributes === 'object' ? m.attributes : {}
    }))
    : [];
  c.conversation.flow = normalizeMessageFlow(c.conversation.flow);
  if (c.conversation.flow.length) c.meta.mode = c.conversation.flow.some(item => item.type === 'delay') ? 'multi' : 'single';
  c.conversation.intervalSeconds = Number.isFinite(Number(c.conversation.intervalSeconds))
    ? Number(c.conversation.intervalSeconds)
    : 3;
  return c;
}

function updateCaseFromForm() {
  const c = activeCase();
  if (!c) return null;
  if (window.renderCaseEditor) return c;
  if (state.contentEditMode === 'json') {
    return syncJsonEditorToCase() ? c : null;
  }
  normalizeCase(c);
  c.meta.name = $('caseName').value.trim() || '未命名用例';
  c.meta.mode = $('caseMode').value;
  c.meta.expectedResult = $('expectedResult').value;
  c.message.tagList = parseTags($('tagList').value);
  c.session.mode = $('sessionMode').value;

  if (c.meta.mode === 'single') {
    c.message.input = readSingleInputs();
    c.message.inputList = safeJsonParse($('inputList').value, []);
    c.conversation.messages = [];
  } else {
    c.conversation.messages = readChatMessages();
    c.conversation.intervalSeconds = Number($('multiIntervalSeconds').value || 3);
    c.message.inputList = safeJsonParse($('inputList').value, []);
    if (c.conversation.messages.length) {
      const lastStudent = [...c.conversation.messages].reverse().find(m => m.role === 'student');
      c.message.input = lastStudent?.input?.length ? [...lastStudent.input] : [];
    }
  }
  return c;
}

function setView(name) {
  $('casesView').classList.toggle('active', name === 'cases');
  $('recordsView').classList.toggle('active', name === 'records');
  $('labelsView').classList.toggle('active', name === 'labels');
  if (name !== 'cases') document.body.classList.remove('case-detail-open');
  if (name !== 'records') document.body.classList.remove('record-detail-open');
  if (name === 'cases') showCaseList(false);
  if (name === 'records') {
    showRecordList(false);
    loadRecords();
  }
  renderListToolbars();
}

function beginCaseEditing() {
  const c = activeCase();
  if (!c || state.editorOriginalCase?.id === c.id) return;
  state.editorOriginalCase = copyCaseData(c);
  state.editorDirty = false;
}

function clearCaseEditing() {
  state.editorOriginalCase = null;
  state.editorDirty = false;
}

function restoreCaseEdits() {
  const original = state.editorOriginalCase;
  if (!original) return;
  const index = state.cases.findIndex(item => item.id === original.id);
  if (index >= 0) state.cases[index] = normalizeCase(copyCaseData(original));
  state.editorRevision++;
  state.editorDirty = false;
  renderCaseList();
  renderEditor();
}

function hasCompleteMessages(c) {
  const hasBlank = values => !values.length || values.some(value => !String(value || '').trim());
  if (Array.isArray(c.conversation?.flow) && c.conversation.flow.length) {
    const flow = c.conversation.flow;
    return flow.length > 0 && flow[0]?.type === 'message' && flow.at(-1)?.type === 'message' && flow.every((item, index) => item.type === 'message'
      ? Boolean(String(item.content || '').trim())
      : item.type === 'delay' && Number.isFinite(item.seconds) && item.seconds >= 0 && index > 0 && index < flow.length - 1 && flow[index - 1]?.type === 'message' && flow[index + 1]?.type === 'message');
  }
  const requests = c.conversation.messages || [];
  if (requests.length) return requests.every(request => !hasBlank(request.input || []));
  return !hasBlank(c.message.input || []);
}

async function confirmLeaveCaseEditor() {
  if (!state.editorDirty) return true;
  const choice = await window.showUnsavedCaseChangesDialog?.();
  if (choice === 'save') return saveActiveCase();
  if (choice === 'discard') {
    restoreCaseEdits();
    return true;
  }
  return false;
}

async function leaveCaseEditor() {
  if (!await confirmLeaveCaseEditor()) return false;
  clearCaseEditing();
  if (history.state?.page === 'case-detail') history.back();
  else {
    history.replaceState({ page: 'case-list' }, '', window.location.href);
    showCaseList();
  }
  return true;
}

async function switchCaseEditor(caseId) {
  const wasDetail = state.casePage === 'detail';
  if (caseId !== state.activeCaseId && wasDetail && !await confirmLeaveCaseEditor()) return;
  if (caseId !== state.activeCaseId) clearCaseEditing();
  state.activeCaseId = caseId;
  renderCaseList();
  showCaseDetail(wasDetail ? 'replace' : 'push');
}

async function requestViewChange(name) {
  if (state.casePage === 'detail' && !await confirmLeaveCaseEditor()) return;
  if (state.casePage === 'detail') clearCaseEditing();
  setView(name);
}

function showCaseList(render = true) {
  state.casePage = 'list';
  document.body.classList.remove('case-detail-open');
  $('casesView').classList.add('list');
  $('casesView').classList.remove('detail');
  if (render) renderCaseList();
}

function showCaseDetail(historyMode = 'none') {
  state.casePage = 'detail';
  beginCaseEditing();
  const historyState = { page: 'case-detail', caseId: state.activeCaseId };
  if (historyMode === 'push') history.pushState(historyState, '', window.location.href);
  if (historyMode === 'replace') history.replaceState(historyState, '', window.location.href);
  document.body.classList.add('case-detail-open');
  window.renderMqSettingsButton?.({ visible: false });
  $('casesView').classList.add('detail');
  $('casesView').classList.remove('list');
  renderEditor();
}

function showRecordList(render = true) {
  state.recordPage = 'list';
  document.body.classList.remove('record-detail-open');
  $('recordsView').classList.add('list');
  $('recordsView').classList.remove('detail');
  $('backToRecordsBtn').classList.add('hidden');
  window.renderRecordDetailChrome?.(null);
  if (render) renderRecordList();
}

function showRecordDetailPage() {
  state.recordPage = 'detail';
  document.body.classList.add('record-detail-open');
  window.renderMqSettingsButton?.({ visible: false });
  $('recordsView').classList.add('detail');
  $('recordsView').classList.remove('list');
  $('backToRecordsBtn').classList.add('hidden');
}

function renderListToolbars() {
  const visible = !document.body.classList.contains('case-detail-open') && !document.body.classList.contains('record-detail-open');
  window.renderMqSettingsButton?.({ visible });
  window.renderUpdateManagerButton?.({ visible, currentVersion: state.updateStatus.currentVersion, updateAvailable: state.updateCheck?.updateAvailable });
  if (!window.renderAntListPages) return;
  window.renderAntListPages({
    activeView: $('labelsView').classList.contains('active') ? 'labels' : $('recordsView').classList.contains('active') ? 'records' : 'cases',
    cases: state.caseListData || {
      items: [],
      search: state.caseSearch,
      scenario: state.caseScenarioFilter,
      scenarios: labelNames('businessScenarios'),
      allCount: state.cases.length,
      selected: state.selectedCases.size,
      selectedIds: [],
      sort: state.caseSort,
      pageNo: state.casePageNo,
      pageSize: state.casePageSize,
      total: 0
    },
    records: state.recordListData || {
      items: [],
      search: state.recordSearch,
      triggerMessage: state.recordTriggerMessage,
      weworkCorpId: state.recordWeworkCorpId,
      friendNick: state.recordFriendNick,
      pageNo: state.recordPageNo,
      pageSize: state.recordPageSize,
      total: 0
    },
    management: labelManagementData()
  });
}

function renderCaseList() {
  const query = state.caseSearch.trim().toLowerCase();
  const scenarioFilter = state.caseScenarioFilter;
  const filtered = state.cases.filter(c => {
    const hay = [
      c.meta.name,
      c.meta.businessScenario,
      `${messageBatchCount(c)} 批`,
      ...(c.message.tagList || []),
      c.message.input?.[0] || ''
    ].join(' ').toLowerCase();
    return (!query || hay.includes(query)) && (!scenarioFilter || c.meta.businessScenario === scenarioFilter);
  });
  const { field, order } = state.caseSort;
  const sorted = !field || !order ? filtered : [...filtered].sort((left, right) => {
    const leftValue = field === 'name' ? left.meta.name : field === 'createdAt' ? left.meta.createdAt : left.meta.updatedAt;
    const rightValue = field === 'name' ? right.meta.name : field === 'createdAt' ? right.meta.createdAt : right.meta.updatedAt;
    const result = String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-CN', { numeric: true, sensitivity: 'base' });
    return order === 'ascend' ? result : -result;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.casePageSize));
  state.casePageNo = Math.min(state.casePageNo, totalPages);
  const start = (state.casePageNo - 1) * state.casePageSize;
  const pageItems = sorted.slice(start, start + state.casePageSize);
  const currentPageIds = pageItems.map(c => c.id);
  state.caseListData = {
    items: pageItems.map(c => ({
      id: c.id,
      name: c.meta.name,
      note: c.meta.expectedResult || '',
      businessScenario: c.meta.businessScenario || c.businessScenario || '',
      batchCount: messageBatchCount(c),
      input: previewCaseInputs(c),
      tags: c.message.tagList || [],
      createdAt: c.meta.createdAt || '',
      updatedAt: c.meta.updatedAt || ''
    })),
    search: state.caseSearch,
    scenario: state.caseScenarioFilter,
    scenarios: labelNames('businessScenarios'),
    allCount: state.cases.length,
    selected: state.selectedCases.size,
    selectedIds: [...state.selectedCases],
    sort: state.caseSort,
    pageNo: state.casePageNo,
    pageSize: state.casePageSize,
    total: sorted.length,
    pageIds: currentPageIds
  };
  renderListToolbars();
}

function renderEditor() {
  const c = activeCase();
  $('emptyCase').classList.toggle('hidden', !!c);
  $('caseEditor').classList.toggle('hidden', !c);
  if (!c) return;
  normalizeCase(c);
  if (state.contentCaseId !== c.id) {
    state.contentCaseId = c.id;
    state.contentEditMode = 'message';
  }
  $('caseName').value = c.meta.name || '';
  $('caseMode').value = c.meta.mode || 'single';
  document.querySelectorAll('input[name="caseModeRadio"]').forEach(radio => {
    radio.checked = radio.value === $('caseMode').value;
  });
  $('expectedResult').value = c.meta.expectedResult || '';
  $('tagList').value = tagsText(c.message.tagList);
  $('singleInput').value = '';
  $('inputList').value = JSON.stringify(c.message.inputList || [], null, 2);
  renderSingleHistory(c.message.inputList || []);
  renderSingleMessageList(c.message.input || []);
  renderModeEditors();
  renderAttrControls();
  renderContentEditorMode();
  syncCaseDetailChrome();
  if (window.renderCaseEditor) {
    window.renderCaseEditor({
      caseData: c,
      cases: state.cases,
      scenarios: labelNames('businessScenarios'),
      archivedScenarios: labelNames('businessScenarios', 'archived'),
      userTags: labelNames('userTags'),
      archivedUserTags: labelNames('userTags', 'archived'),
      config: state.config,
      revision: state.editorRevision
    });
  }
}

function syncCaseDetailChrome() {
  if (!window.renderCaseDetailChrome) return;
  const c = activeCase();
  window.renderCaseDetailChrome(c ? {
    id: c.id,
    name: $('caseName').value,
    note: $('expectedResult').value
  } : null);
}

function renderSingleHistory(history) {
  const entries = Array.isArray(history) ? history.slice(-4) : [];
  $('singleHistory').innerHTML = entries.length
    ? entries.map(entry => {
      const raw = String(entry || '');
      const [sender, ...content] = raw.split(':');
      const isStudent = !String(sender).startsWith('168885');
      const text = content.length ? content.join(':') : raw;
      return `<div class="history-bubble ${isStudent ? 'student' : ''}">${escapeHtml(text)}</div>`;
    }).join('')
    : '<div class="item-sub">暂无历史消息，可在右侧 inputList 中补充。</div>';
}

function renderSingleMessageList(inputs) {
  const values = (inputs || []).map(value => String(value || '')).filter(value => value.trim());
  $('singleMessageList').innerHTML = values.length
    ? values.map((value, index) => `
      <div class="student-message-bubble">
        <div class="history-bubble student">${escapeHtml(value)}</div>
        <button class="remove-single-input bubble-delete" type="button" data-index="${index}" aria-label="删除此条消息" title="删除此条消息">&times;</button>
      </div>`).join('')
    : '<div class="item-sub">暂无消息内容</div>';
}

function readSingleInputs() {
  return [...(activeCase()?.message?.input || [])]
    .map(value => String(value || ''))
    .filter(value => value.trim());
}

const PROTOCOL_FIELDS = [
  'requestId', 'input', 'latestMsgTime', 'weworkCorpId', 'agentId', 'addTime',
  'weworkAccount', 'friendNick', 'friendExternalId', 'tagList', 'inputList',
  'weworkAccountAlias', 'friendRemoteId'
];

function protocolPayload(c, input, inputList, attrs = {}) {
  const payload = {};
  PROTOCOL_FIELDS.forEach(key => {
    if (key === 'input') payload.input = [...input];
    else if (key === 'inputList') payload.inputList = [...inputList];
    else if (key === 'tagList') payload.tagList = [...(c.message.tagList || [])];
    else payload[key] = c.message[key] ?? '';
  });
  Object.entries(attrs).forEach(([key, value]) => {
    if (PROTOCOL_FIELDS.includes(key)) payload[key] = value;
  });
  return payload;
}

function messageFlowGroups(flow) {
  const groups = [];
  let current = [];
  normalizeMessageFlow(flow).forEach(item => {
    if (item.type === 'message') current.push(item);
    else if (current.length) {
      groups.push({ messages: current, delaySeconds: item.seconds });
      current = [];
    }
  });
  if (current.length) groups.push({ messages: current, delaySeconds: 0 });
  return groups;
}

function contentJsonSnapshot(c) {
  const mode = c.meta.mode === 'multi' ? 'multi' : 'single';
  const unifiedAttrs = c.session.mode === 'custom' || c.session.mode === 'unified'
    ? c.session.attributes
    : {};
  const flowGroups = messageFlowGroups(c.conversation?.flow);
  if (flowGroups.length) {
    const history = [...(c.message.inputList || [])];
    const payloads = flowGroups.map(group => {
      const attrs = c.session.mode === 'perMessage' ? (group.messages[0]?.attributes || {}) : unifiedAttrs;
      const payload = protocolPayload(c, group.messages.map(item => item.content), history, attrs);
      group.messages.forEach(item => history.push(`${c.message.friendRemoteId || 'friendRemoteId'}:${item.content}`));
      return payload;
    });
    return payloads.length === 1 ? payloads[0] : payloads;
  }
  if (mode === 'single') {
    return protocolPayload(c, c.message.input || [], c.message.inputList || [], unifiedAttrs);
  }
  const history = [...(c.message.inputList || [])];
  return (c.conversation.messages || []).map(message => {
    const attrs = c.session.mode === 'perMessage' ? (message.attributes || {}) : unifiedAttrs;
    const payload = protocolPayload(c, message.input || [], history, attrs);
    (message.input || []).forEach(value => history.push(`${c.message.friendRemoteId || 'friendRemoteId'}:${value}`));
    return payload;
  });
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportCases() {
  const selectedIds = [...state.selectedCases];
  const cases = selectedIds.length
    ? state.cases.filter(c => state.selectedCases.has(c.id))
    : state.cases;
  if (!cases.length) {
    toast('没有可导出的测试用例', 'warning');
    return;
  }
  const exportedAt = new Date().toISOString();
  const payload = {
    '//': [
      'caseName：测试用例名称，非协议字段，仅用于导入/查看时识别用例。',
      'businessScenario：业务场景，非协议字段，用于列表筛选和分类。',
      'expectedResult：备注/预期结果，非协议字段。',
      'jsonMessages：构建好的协议 JSON 消息列表；同一个 caseName 下如有多条 jsonMessages，表示这些请求属于同一个测试用例。'
    ],
    exportedAt,
    cases: cases.map(c => {
      const json = contentJsonSnapshot(c);
      const jsonMessages = Array.isArray(json) ? json : [json];
      return {
        caseName: c.meta.name || '未命名用例',
        businessScenario: c.meta.businessScenario || '',
        expectedResult: c.meta.expectedResult || '',
        jsonMessages,
        caseData: copyCaseData(c)
      };
    })
  };
  downloadJsonFile(`测试用例导出_${exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, payload);
  toast(`已导出 ${cases.length} 个测试用例`);
}

function syncJsonEditorToCase(showError = true) {
  const c = activeCase();
  if (!c) return false;
  let parsed;
  try {
    parsed = JSON.parse($('messageJsonEditor').value);
  } catch (err) {
    if (showError) toast('JSON 格式不正确，请修正后再切换', 'error');
    return false;
  }
  const payloads = Array.isArray(parsed) ? parsed : [parsed];
  if (!payloads.length || payloads.some(payload => !payload || typeof payload !== 'object' || Array.isArray(payload))) {
    if (showError) toast('JSON 必须是消息对象，或由消息对象组成的数组', 'error');
    return false;
  }
  const first = payloads[0];
  PROTOCOL_FIELDS.forEach(key => {
    if (key === 'input' || key === 'inputList' || key === 'tagList') return;
    if (first[key] !== undefined) c.message[key] = first[key];
  });
  c.message.tagList = Array.isArray(first.tagList) ? first.tagList : [];
  c.message.inputList = Array.isArray(first.inputList) ? first.inputList : [];
  if (Array.isArray(parsed)) {
    c.meta.mode = 'multi';
    c.conversation.messages = payloads.map((payload, index) => ({
      id: c.conversation.messages[index]?.id || `msg_${Date.now()}_${index}`,
      role: 'student',
      input: Array.isArray(payload.input) ? payload.input : [],
      delaySeconds: c.conversation.intervalSeconds || 3,
      attributes: c.conversation.messages[index]?.attributes || {}
    }));
  } else {
    c.meta.mode = 'single';
    c.message.input = Array.isArray(first.input) ? first.input : [];
    c.conversation.messages = [];
  }
  normalizeCase(c);
  return true;
}

function renderContentEditorMode() {
  const isJson = state.contentEditMode === 'json';
  $('detailMain').classList.toggle('hidden', isJson);
  $('conversationProperties').classList.toggle('hidden', isJson);
  $('jsonContentEditor').classList.toggle('hidden', !isJson);
  $('jsonModeToggle').checked = isJson;
  if (isJson) $('messageJsonEditor').value = JSON.stringify(contentJsonSnapshot(activeCase()), null, 2);
}

function setContentEditorMode(mode) {
  if (mode === state.contentEditMode) return;
  if (mode === 'json') {
    const c = updateCaseFromForm();
    if (!c) return;
    state.contentEditMode = 'json';
    renderContentEditorMode();
    return;
  }
  if (!syncJsonEditorToCase()) {
    $('jsonModeToggle').checked = true;
    return;
  }
  state.contentEditMode = 'message';
  renderEditor();
}

function renderSessionMode() {
  const c = activeCase();
  const mode = $('caseMode').value;
  const current = c?.session?.mode || 'system';
  let options;
  if (mode === 'single') {
    options = [
      ['system', '系统默认', '未配置字段由系统构建时生成'],
      ['custom', '自定义', '为当前单轮消息设置额外属性']
    ];
    $('sessionMode').innerHTML = options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
    $('sessionMode').value = current === 'custom' ? 'custom' : 'system';
  } else {
    options = [
      ['system', '系统默认', '未配置字段由系统构建时生成'],
      ['unified', '统一配置', '所有学员触发消息共用同一组属性'],
      ['perMessage', '单个配置', '每条学员触发消息可单独覆盖属性']
    ];
    $('sessionMode').innerHTML = options.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
    $('sessionMode').value = ['system', 'unified', 'perMessage'].includes(current) ? current : 'system';
  }
  $('sessionModeRadios').innerHTML = options.map(([value, title, sub]) => `
    <label class="radio-item">
      <input type="radio" name="sessionModeRadio" value="${value}" ${$('sessionMode').value === value ? 'checked' : ''}>
      <span>
        <span class="radio-title">${title}</span>
        <span class="radio-sub">${sub}</span>
      </span>
    </label>
  `).join('');
}

function fieldByKey(key) {
  return state.fields.find(f => f.key === key);
}

function attributeFields() {
  return state.fields.filter(field => !['agentId', 'tagList'].includes(field.key));
}

function renderAttributeFieldSelect(selectedKey) {
  const fields = attributeFields();
  const key = fields.some(field => field.key === selectedKey) ? selectedKey : fields[0]?.key;
  $('attrKey').innerHTML = fields.map(field => `
    <option value="${escapeHtml(field.key)}" data-label="${escapeHtml(field.label)}">${escapeHtml(field.label)}（${escapeHtml(field.key)}）</option>
  `).join('');
  $('attrKey').value = key || '';
  [...$('attrKey').options].forEach(option => {
    if (option.value === $('attrKey').value) option.textContent = option.value;
  });
}

function renderAttrControls() {
  const c = activeCase();
  const mode = $('sessionMode').value;
  const configVisible = mode !== 'system';
  $('attributeConfigContent').classList.toggle('hidden', !configVisible);
  if (!configVisible) return;
  const perMessage = mode === 'perMessage';
  const messages = (c?.conversation?.messages || []).filter(m => m.role !== 'teacher');
  if (perMessage && !messages.some(m => m.id === state.attrTargetMessageId)) {
    state.attrTargetMessageId = messages[0]?.id || null;
  }
  $('attrTargetRow').classList.toggle('hidden', !perMessage);
  if (perMessage) {
    $('attrTarget').innerHTML = messages.length
      ? messages.map((m, i) => `<option value="${escapeHtml(m.id)}">第 ${i + 1} 条用户消息：${escapeHtml(m.input?.[0] || '未填写内容')}</option>`).join('')
      : '<option value="">请先添加用户消息</option>';
    $('attrTarget').value = state.attrTargetMessageId || '';
  }
  const target = perMessage ? messages.find(m => m.id === state.attrTargetMessageId) : null;
  const disabled = perMessage && !target;
  renderAttributeFieldSelect($('attrKey').value);
  renderAttrInput();
  $('attrKey').disabled = disabled;
  $('attrValue').disabled = disabled;
  $('addAttrBtn').disabled = disabled;
  const attrs = perMessage ? (target?.attributes || {}) : (c?.session?.attributes || {});
  const entries = Object.entries(attrs);
  $('attrList').innerHTML = disabled
    ? '<span class="item-sub">请先添加一条用户消息，再为该消息配置属性。</span>'
    : entries.length
      ? entries.map(([key, value]) => `
        <span class="attr-pill">
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</span>
          <button data-remove-attr="${escapeHtml(key)}">×</button>
        </span>`).join('')
      : '<span class="item-sub">尚未添加会话属性</span>';
}

function renderAttrInput() {
  const field = fieldByKey($('attrKey').value) || state.fields[0];
  if (!field) return;
  const old = $('attrValue');
  const input = document.createElement(field.type === 'tags' ? 'textarea' : 'input');
  input.id = 'attrValue';
  input.className = field.type === 'tags' ? 'textarea small' : 'input';
  input.placeholder = field.type === 'tags' ? '一行一个，或用逗号分隔' : '属性值';
  if (field.type === 'datetime-local') input.type = 'datetime-local';
  if (old) old.replaceWith(input);
  else $('attrValueSlot').appendChild(input);
}

function renderModeEditors() {
  const c = activeCase();
  const mode = $('caseMode').value;
  $('singleEditor').classList.toggle('hidden', mode !== 'single');
  $('multiEditor').classList.toggle('hidden', mode !== 'multi');
  renderSessionMode();
  if (mode === 'multi') {
    $('multiIntervalSeconds').value = c.conversation.intervalSeconds ?? 3;
    renderChatList(c.conversation.messages || []);
  }
}

function renderChatList(messages) {
  if (!messages.length) {
    $('chatList').innerHTML = '<div class="empty">添加用户消息来构建多轮会话</div>';
    return;
  }
  if (!messages.some(m => m.id === state.selectedMessageId)) state.selectedMessageId = messages[0].id;
  $('chatList').innerHTML = messages.map((m, i) => `
    <div class="chat-card ${m.id === state.selectedMessageId ? 'selected' : ''}" data-index="${i}" data-id="${escapeHtml(m.id)}">
      <div class="chat-head">
        <span class="chat-kind">第 ${i + 1} 条用户消息</span>
        <span class="chat-index">input：${m.input.length} 条</span>
        <button class="secondary move-up" ${i === 0 ? 'disabled' : ''}>上移</button>
        <button class="danger remove-chat">删除</button>
      </div>
      <div class="message-preview-list">
        ${m.input.map((value, inputIndex) => `
          <div class="student-message-bubble">
            <div class="history-bubble student">${escapeHtml(value)}</div>
            <button class="remove-card-input bubble-delete" type="button" data-input-index="${inputIndex}" aria-label="删除此条消息" title="删除此条消息">&times;</button>
          </div>`).join('') || '<div class="item-sub">暂无消息内容</div>'}
      </div>
      <div class="chat-expanded ${m.id === state.selectedMessageId ? '' : 'hidden'}">
        <div class="message-composer">
          <textarea class="textarea chat-composer-input" placeholder="输入新的发送消息"></textarea>
          <button class="add-card-input" type="button">添加发送内容</button>
        </div>
        ${quickConfigHtml()}
      </div>
    </div>
  `).join('');
}

function readChatMessages() {
  return [...document.querySelectorAll('.chat-card')].map(card => ({
    id: activeCase()?.conversation?.messages?.[Number(card.dataset.index)]?.id,
    role: 'student',
    input: [...(activeCase()?.conversation?.messages?.[Number(card.dataset.index)]?.input || [])],
    delaySeconds: Number($('multiIntervalSeconds').value || 3),
    attributes: activeCase()?.conversation?.messages?.[Number(card.dataset.index)]?.attributes || {}
  }));
}

function quickConfigHtml() {
  const intent = Object.entries(INTENT_LABELS)
    .map(([key, label]) => `<button type="button" data-random-input="intent:${escapeHtml(key)}">${escapeHtml(label)}</button>`).join('');
  const address = Object.entries(ADDRESS_LABELS)
    .map(([key, label]) => `<button type="button" data-random-input="address:${escapeHtml(key)}">${escapeHtml(label)}</button>`).join('');
  return `<section class="message-quick-config card-quick-config">
    <div class="quick-hover-groups">
      <div class="quick-hover-group"><button class="secondary quick-trigger">用户意向</button><div class="hover-menu">${intent}</div></div>
      <div class="quick-hover-group"><button class="secondary quick-trigger">收货地址</button><div class="hover-menu">${address}</div></div>
    </div>
  </section>`;
}

async function loadInitial() {
  state.config = normalizeConfigLabels(await api('/api/config'));
  state.fields = (await api('/api/meta')).sessionAttributeFields || [];
  await loadUpdateStatus().catch(error => console.warn('无法读取在线更新状态：', error));
  renderQuickTools();
  await loadCases();
  showCaseList();
}

async function loadCases() {
  state.cases = (await api('/api/cases')).map(normalizeCase);
  if (!state.activeCaseId && state.cases[0]) state.activeCaseId = state.cases[0].id;
  renderCaseList();
  renderEditor();
}

async function saveActiveCase() {
  const c = updateCaseFromForm();
  if (!c) return false;
  const editorBusinessScenario = window.getCaseEditorBusinessScenario?.(c.id);
  if (editorBusinessScenario !== undefined) c.meta.businessScenario = String(editorBusinessScenario || '').trim();
  if (!hasCompleteMessages(c)) {
    toast('请填写所有消息内容后再保存', 'warning');
    return false;
  }
  const saved = normalizeCase(await api(`/api/cases/${encodeURIComponent(c.id)}`, {
    method: 'PUT',
    body: JSON.stringify(c)
  }));
  const idx = state.cases.findIndex(x => x.id === saved.id);
  if (idx >= 0) state.cases[idx] = saved;
  state.activeCaseId = saved.id;
  state.editorOriginalCase = copyCaseData(saved);
  state.editorDirty = false;
  renderCaseList();
  renderEditor();
  toast('已保存');
  return true;
}

function updateCaseFromEditor(nextCase) {
  const current = activeCase();
  if (!current) return;
  if (!state.editorOriginalCase || state.editorOriginalCase.id !== current.id) state.editorOriginalCase = copyCaseData(current);
  const next = normalizeCase({ ...nextCase, id: current.id });
  const index = state.cases.findIndex(item => item.id === current.id);
  if (index < 0) return;
  const titleChanged = next.meta.name !== current.meta.name;
  state.cases[index] = next;
  $('caseName').value = next.meta.name;
  $('expectedResult').value = next.meta.expectedResult;
  state.editorDirty = true;
  if (titleChanged) syncCaseDetailChrome();
  renderCaseList();
}

window.updateCaseFromEditor = updateCaseFromEditor;

window.saveCaseLabels = async changes => {
  const nextConfig = { ...state.config };
  ['businessScenarios', 'userTags'].forEach(key => {
    if (!changes[key]) return;
    const items = normalizeLabelItems(state.config?.[key]);
    const names = new Set(items.map(item => item.name));
    changes[key].map(value => String(value || '').trim()).filter(Boolean).forEach(name => {
      if (!names.has(name)) {
        names.add(name);
        items.push({ name, status: 'active' });
      }
    });
    nextConfig[key] = items;
  });
  state.config = normalizeConfigLabels(await api('/api/config', { method: 'PUT', body: JSON.stringify(nextConfig) }));
  renderEditor();
  return state.config;
};

async function manageLabelItem(labelType, action, name, replacement) {
  const result = await api('/api/label-management', {
    method: 'POST',
    body: JSON.stringify({ type: labelType, action, name, replacement })
  });
  state.config = normalizeConfigLabels(result.config);
  await loadCases();
  const typeLabel = labelType === 'userTags' ? '用户标签' : '业务场景';
  const actionText = { create: '新增', archive: '归档', restore: '恢复', delete: '删除', replace: '替换', remove: '移除', clear: '清空' }[action] || '更新';
  toast(`${typeLabel}${actionText}成功`);
}

async function deleteSelectedLabelItems(labelType, names) {
  const selectedNames = [...new Set((names || []).map(name => String(name || '').trim()).filter(Boolean))];
  if (!selectedNames.length) {
    toast('请先勾选要删除的项目', 'warning');
    return;
  }
  const typeLabel = labelType === 'userTags' ? '用户标签' : '业务场景';
  if (!await window.showBatchDeleteConfirm?.(selectedNames.length, typeLabel)) return;
  const result = await api('/api/label-management/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ type: labelType, names: selectedNames })
  });
  state.config = normalizeConfigLabels(result.config);
  await loadCases();
  toast(`已删除 ${selectedNames.length} 个${typeLabel}`);
}

function availableAgentIds() {
  return [...new Set([
    state.config?.lastSelectedAgentId,
    state.config?.defaultAgentId,
    ...(state.config?.agentIds || []),
    ...state.cases.map(c => c.message?.agentId)
  ].filter(Boolean))];
}

function preferredSendAgentId() {
  return state.config?.lastSelectedAgentId || state.config?.defaultAgentId || 'testId';
}

async function loadMqConfigs() {
  state.mqConfigs = await api('/api/mq-configs');
  return state.mqConfigs;
}

function renderMqSettingsDialog() {
  window.renderMqSettings?.({
    open: state.mqSettingsOpen,
    configs: state.mqConfigs,
    selectedId: state.mqSettingsSelectedId
  });
}

async function openMqSettings() {
  await loadMqConfigs();
  state.mqSettingsOpen = true;
  state.mqSettingsSelectedId ||= state.mqConfigs[0]?.id || null;
  renderMqSettingsDialog();
}

function closeMqSettings() {
  state.mqSettingsOpen = false;
  renderMqSettingsDialog();
}

async function saveMqConfig(config) {
  const method = config.id ? 'PUT' : 'POST';
  const path = config.id ? `/api/mq-configs/${encodeURIComponent(config.id)}` : '/api/mq-configs';
  const saved = await api(path, { method, body: JSON.stringify(config) });
  await loadMqConfigs();
  state.mqSettingsSelectedId = saved.id;
  renderMqSettingsDialog();
  toast('MQ 配置已保存');
}

async function loadUpdateStatus() {
  state.updateStatus = await api('/api/update/status');
  return state.updateStatus;
}

function renderUpdateDialog() {
  window.renderUpdateDialog?.({
    open: state.updateDialogOpen,
    status: state.updateStatus,
    check: state.updateCheck
  });
}

async function openUpdateDialog() {
  await loadUpdateStatus();
  state.updateDialogOpen = true;
  renderUpdateDialog();
}

function closeUpdateDialog() {
  state.updateDialogOpen = false;
  renderUpdateDialog();
}

async function checkForUpdate() {
  state.updateCheck = await api('/api/update/check', { method: 'POST' });
  renderUpdateDialog();
  renderListToolbars();
  if (!state.updateCheck.updateAvailable) {
    const available = (state.updateCheck.sources || []).some(source => source.ok);
    toast(available ? '当前已是最新版本' : '两个更新源均不可用', available ? 'success' : 'warning');
  }
}

async function applyOnlineUpdate() {
  const result = await api('/api/update/apply', { method: 'POST', body: JSON.stringify({ restart: true }) });
  toast(`已更新至 ${result.version}，正在重启服务`);
  setTimeout(() => window.location.reload(), result.restartScheduled ? 2600 : 800);
}

async function rollbackOnlineUpdate(backupId) {
  const result = await api('/api/update/rollback', { method: 'POST', body: JSON.stringify({ backupId, restart: true }) });
  toast(`已回滚 ${result.restored.length} 个文件，正在重启服务`);
  setTimeout(() => window.location.reload(), result.restartScheduled ? 2600 : 800);
}

async function openSendDialog(target) {
  state.sendTarget = target;
  await loadMqConfigs();
  window.renderSendDialog?.({ open: true, agents: availableAgentIds(), defaultAgentId: preferredSendAgentId(), mqConfigs: state.mqConfigs, defaultMqConfigId: state.mqConfigs[0]?.id || '' });
}

function closeSendDialog() {
  state.sendTarget = null;
  window.renderSendDialog?.({ open: false, agents: availableAgentIds(), defaultAgentId: preferredSendAgentId(), mqConfigs: state.mqConfigs, defaultMqConfigId: state.mqConfigs[0]?.id || '' });
}

async function resolveSendAgent(value) {
  const agentId = String(value || preferredSendAgentId()).trim() || preferredSendAgentId();
  if (!availableAgentIds().includes(agentId) || state.config.lastSelectedAgentId !== agentId) {
    const nextConfig = {
      ...state.config,
      agentIds: [...new Set([...(state.config.agentIds || []), agentId])],
      lastSelectedAgentId: agentId
    };
    state.config = normalizeConfigLabels(await api('/api/config', { method: 'PUT', body: JSON.stringify(nextConfig) }));
  }
  return agentId;
}

async function createAgentId(value) {
  const agentId = String(value || '').trim();
  if (!agentId || availableAgentIds().includes(agentId)) return;
  const nextConfig = {
    ...state.config,
    agentIds: [...new Set([...(state.config.agentIds || []), agentId])]
  };
  state.config = normalizeConfigLabels(await api('/api/config', { method: 'PUT', body: JSON.stringify(nextConfig) }));
  window.renderSendDialog?.({ open: true, agents: availableAgentIds(), defaultAgentId: preferredSendAgentId(), mqConfigs: state.mqConfigs, defaultMqConfigId: state.mqConfigs[0]?.id || '' });
}

async function requestSendActiveCase() {
  const c = updateCaseFromForm();
  if (!c) return;
  if (!await saveActiveCase()) return;
  await openSendDialog({ type: 'case', caseId: c.id });
}

async function requestSendCaseById(caseId) {
  await openSendDialog({ type: 'case', caseId });
}

async function createCase() {
  const c = await api('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ name: '新测试用例' })
  });
  state.activeCaseId = c.id;
  await loadCases();
  showCaseDetail('push');
}

async function duplicateCaseById(caseId) {
  const copy = await api(`/api/cases/${encodeURIComponent(caseId)}/duplicate`, { method: 'POST' });
  await loadCases();
  toast('已复制用例');
  return copy;
}

async function duplicateCase() {
  const c = activeCase();
  if (!c) return;
  const copy = await duplicateCaseById(c.id);
  state.activeCaseId = copy.id;
  showCaseDetail('replace');
}

async function duplicateCaseFromEditor() {
  if (!await confirmLeaveCaseEditor()) return;
  clearCaseEditing();
  await duplicateCase();
}

async function deleteCase() {
  const c = activeCase();
  if (!c) return;
  await deleteCaseById(c.id, { returnToList: true });
}

async function deleteCaseById(caseId, options = {}) {
  const c = state.cases.find(item => item.id === caseId);
  if (!c) return;
  if (caseId === state.activeCaseId && !await confirmLeaveCaseEditor()) return;
  if (!options.confirmed && !confirm(`确定删除「${c.meta.name || '未命名用例'}」吗？`)) return;
  await api(`/api/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' });
  state.selectedCases.delete(caseId);
  if (state.activeCaseId === caseId) state.activeCaseId = null;
  await loadCases();
  if (options.returnToList || state.casePage === 'detail') showCaseList();
  toast('已删除');
}

async function deleteSelectedCases() {
  const ids = [...state.selectedCases];
  if (!ids.length) {
    toast('请先勾选测试用例', 'warning');
    return;
  }
  if (ids.includes(state.activeCaseId) && !await confirmLeaveCaseEditor()) return;
  if (!await window.showBatchDeleteConfirm?.(ids.length)) return;
  await Promise.all(ids.map(caseId => api(`/api/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' })));
  if (ids.includes(state.activeCaseId)) state.activeCaseId = null;
  state.selectedCases.clear();
  await loadCases();
  if (state.casePage === 'detail') showCaseList();
  toast(`已删除 ${ids.length} 个测试用例`);
}

async function batchEditSelectedCases() {
  const ids = [...state.selectedCases];
  if (!ids.length) {
    toast('请先勾选测试用例', 'warning');
    return;
  }
  const changes = await window.showBatchEditDialog?.({
    count: ids.length,
    scenarios: labelNames('businessScenarios'),
    archivedScenarios: labelNames('businessScenarios', 'archived'),
    userTags: labelNames('userTags'),
    archivedUserTags: labelNames('userTags', 'archived')
  });
  if (!changes || (!changes.changeScenario && !changes.changeTags)) return;

  const businessScenario = String(changes.businessScenario || '').trim();
  const tags = (changes.tags || []).map(value => String(value || '').trim()).filter(Boolean);
  if (changes.changeScenario && businessScenario && !labelNames('businessScenarios').includes(businessScenario)) {
    await window.saveCaseLabels?.({ businessScenarios: [businessScenario] });
  }
  if (changes.changeTags) {
    const newTags = tags.filter(tag => !labelNames('userTags').includes(tag));
    if (newTags.length) await window.saveCaseLabels?.({ userTags: newTags });
  }

  await Promise.all(ids.map(caseId => {
    const current = state.cases.find(item => item.id === caseId);
    if (!current) return Promise.resolve();
    const next = copyCaseData(current);
    if (changes.changeScenario) next.meta.businessScenario = businessScenario;
    if (changes.changeTags) next.message.tagList = tags;
    return api(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'PUT',
      body: JSON.stringify(next)
    });
  }));
  await loadCases();
  toast(`已批量修改 ${ids.length} 个测试用例`);
}

async function requestBatchSend() {
  if (!state.selectedCases.size) {
    toast('请先勾选测试用例', 'warning');
    return;
  }
  if (!await saveActiveCase()) return;
  await openSendDialog({ type: 'batch', ids: [...state.selectedCases] });
}

async function confirmSend(agentValue, mqConfigId) {
  const target = state.sendTarget;
  if (!target) return;
  const agentId = await resolveSendAgent(agentValue);
  closeSendDialog();
  if (target.type === 'batch') {
    const result = await api('/api/send-batch', {
      method: 'POST',
      body: JSON.stringify({ ids: target.ids, agentId, mqConfigId })
    });
    const hasGatewayUnavailable = (result.records || []).some(record => record.status === '网关未就绪');
    const successCount = result.successCount || 0;
    const failCount = result.failCount || 0;
    const type = hasGatewayUnavailable || (failCount > 0 && successCount === 0) ? 'error' : failCount > 0 ? 'warning' : 'success';
    toast(hasGatewayUnavailable
      ? `MQ 网关未就绪：成功 ${result.successCount || 0} 条，失败 ${result.failCount || 0} 条`
      : `批量发送完成：成功 ${result.successCount || 0} 条，失败 ${result.failCount || 0} 条`, type);
    return;
  }
  const record = await api(`/api/cases/${encodeURIComponent(target.caseId)}/send`, {
    method: 'POST',
    body: JSON.stringify({ agentId, mqConfigId })
  });
  const successCount = record.successCount || 0;
  const failCount = record.failCount || 0;
  const type = record.status === '网关未就绪' || (failCount > 0 && successCount === 0) ? 'error' : failCount > 0 ? 'warning' : 'success';
  toast(record.status === '网关未就绪'
    ? `MQ 网关未就绪：${record.failCount || 0} 条未发送`
    : `发送完成：成功 ${record.successCount || 0} 条，失败 ${record.failCount || 0} 条`, type);
}

async function saveImportedCaseLabels(cases) {
  const imported = Array.isArray(cases) ? cases : [];
  const businessScenarios = imported.map(item => item.meta?.businessScenario).filter(Boolean);
  const userTags = imported.flatMap(item => Array.isArray(item.message?.tagList) ? item.message.tagList : []).filter(Boolean);
  if (businessScenarios.length || userTags.length) {
    await window.saveCaseLabels?.({ businessScenarios, userTags });
  }
}

async function importTestCaseFile(file, format) {
  if (format === 'csv') {
    const result = await api('/api/cases/import-csv', {
      method: 'POST',
      body: JSON.stringify({ text: await file.text() })
    });
    await saveImportedCaseLabels(result.cases);
    await loadCases();
    toast(`已导入 ${result.count} 个测试用例`);
    return;
  }
  const importOptions = await window.showImportCaseDialog?.({ scenarios: labelNames('businessScenarios'), archivedScenarios: labelNames('businessScenarios', 'archived'), format });
  if (importOptions === null || importOptions === undefined) return;
  const scenarioSource = format === 'json' && importOptions.scenarioSource === 'file' ? 'file' : 'uniform';
  const scenario = String(importOptions.businessScenario || '').trim();
  if (scenarioSource === 'uniform' && scenario && !labelNames('businessScenarios').includes(scenario)) {
    await window.saveCaseLabels?.({ businessScenarios: [scenario] });
  }
  const text = await file.text();
  if (format === 'json') {
    const result = await api('/api/cases/import-json', {
      method: 'POST',
      body: JSON.stringify({ data: JSON.parse(text), fileName: file.name, businessScenario: scenario, scenarioSource })
    });
    await saveImportedCaseLabels(result.cases);
    await loadCases();
    toast(`已导入 ${result.count} 个测试用例`);
    return;
  }
}

async function loadRecords() {
  state.records = await api('/api/records');
  renderRecordList();
}

function renderRecordList() {
  const query = state.recordSearch.trim().toLowerCase();
  const triggerMessage = state.recordTriggerMessage.trim().toLowerCase();
  const weworkCorpId = state.recordWeworkCorpId.trim().toLowerCase();
  const friendNick = state.recordFriendNick.trim().toLowerCase();
  const filtered = state.records.filter(r => {
    const hay = [r.caseName, r.agentId, r.conversationId, r.status, r.weworkCorpId, r.friendNick, ...(r.triggerMessages || [])].join(' ').toLowerCase();
    const hasTriggerMessage = !triggerMessage || (r.triggerMessages || []).some(message => String(message || '').toLowerCase().includes(triggerMessage));
    const hasWeworkCorpId = !weworkCorpId || String(r.weworkCorpId || '').toLowerCase().includes(weworkCorpId);
    const hasFriendNick = !friendNick || String(r.friendNick || '').toLowerCase().includes(friendNick);
    return (!query || hay.includes(query)) && hasTriggerMessage && hasWeworkCorpId && hasFriendNick;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.recordPageSize));
  state.recordPageNo = Math.min(state.recordPageNo, totalPages);
  const start = (state.recordPageNo - 1) * state.recordPageSize;
  const pageItems = filtered.slice(start, start + state.recordPageSize);
  state.recordListData = {
    items: pageItems,
    search: state.recordSearch,
    triggerMessage: state.recordTriggerMessage,
    weworkCorpId: state.recordWeworkCorpId,
    friendNick: state.recordFriendNick,
    pageNo: state.recordPageNo,
    pageSize: state.recordPageSize,
    total: filtered.length
  };
  renderListToolbars();
}

async function showRecord(date, fileName) {
  const r = await api(`/api/records/detail?date=${encodeURIComponent(date)}&file=${encodeURIComponent(fileName)}`);
  r.date = date;
  r.fileName = fileName;
  state.activeRecord = r;
  renderRecordList();
  showRecordDetailPage();
  window.renderRecordDetailChrome?.(r);
  $('emptyRecord').classList.add('hidden');
  $('recordDetail').classList.remove('hidden');
  const mqMessageCount = r.mqMessageCount ?? r.requestCount ?? (r.snapshots || []).length;
  const userMessageCount = r.userMessageCount ?? r.messageCount ?? (r.snapshots || []).reduce((count, snapshot) => count + (snapshot.payload?.input?.length || 0), 0);
  const snapshots = r.snapshots || [];
  const requests = snapshots.map((snapshot, index) => `
    <div class="bubble">
      <div class="bubble-title">第 ${snapshot.index} 条学员触发消息</div>
      <div class="record-user-messages">${(snapshot.payload?.input || []).map(message => `<div>${escapeHtml(message)}</div>`).join('')}</div>
    </div>
    ${index < snapshots.length - 1 && snapshots[index + 1].delaySeconds ? `<div class="item-sub">等待 ${escapeHtml(snapshots[index + 1].delaySeconds)} 秒后发送</div>` : ''}
  `).join('');
  const payloads = (r.snapshots || []).map(s => `
    <section class="record-request-json">
      <div class="record-request-json-title">Request ${s.index}<button class="secondary copy-request-json" data-request-index="${s.index - 1}">复制 JSON</button></div>
      <pre>${escapeHtml(JSON.stringify(s.payload, null, 2))}</pre>
    </section>
  `).join('');
  $('recordDetail').innerHTML = `
    <div class="record-detail-layout">
      <section class="panel">
        <div class="panel-title">${escapeHtml(r.caseName)}</div>
        <div class="item-sub">${escapeHtml(r.executedAt)} · ${escapeHtml(r.status)} · ${escapeHtml(r.agentId)}</div>
        <div class="item-sub">${mqMessageCount} 条 MQ 消息 · ${userMessageCount} 条用户消息</div>
        <div class="timeline">${requests}</div>
        <div class="record-append-action"><button id="appendRecordMessageBtn" class="secondary">追加消息</button></div>
      </section>
      <section class="panel">
        ${payloads}
      </section>
    </div>`;
  document.querySelectorAll('.copy-request-json').forEach(button => {
    button.onclick = () => copyText(JSON.stringify(r.snapshots?.[Number(button.dataset.requestIndex)]?.payload || {}, null, 2), '已复制 JSON');
  });
  $('appendRecordMessageBtn').onclick = () => document.dispatchEvent(new CustomEvent('record-detail-action', { detail: { type: 'append-message' } }));
}

async function appendMessageToActiveRecord() {
  const record = state.activeRecord;
  if (!record?.date || !record?.fileName) return;
  const message = await window.showAppendRecordMessageDialog?.();
  if (!message) return;
  const result = await api('/api/records/append-message', {
    method: 'POST',
    body: JSON.stringify({ date: record.date, fileName: record.fileName, message })
  });
  const appendResult = result.appendResult || {};
  const type = appendResult.status === '网关未就绪' || (appendResult.failCount > 0 && appendResult.successCount === 0)
    ? 'error'
    : appendResult.failCount > 0 ? 'warning' : 'success';
  await loadRecords();
  await showRecord(result.date, result.fileName);
  toast(appendResult.status === '网关未就绪'
    ? `MQ 网关未就绪：${appendResult.failCount || 0} 条未发送`
    : `追加消息发送完成：成功 ${appendResult.successCount || 0} 条，失败 ${appendResult.failCount || 0} 条`, type);
}

function copyText(text, message) {
  navigator.clipboard.writeText(text || '').then(() => toast(message)).catch(() => toast('复制失败，请重试', 'error'));
}

function renderQuickTools() {
  $('intentQuick').innerHTML = Object.entries(INTENT_LABELS)
    .map(([key, label]) => `<button type="button" data-random-input="intent:${escapeHtml(key)}">${escapeHtml(label)}</button>`)
    .join('');
  $('addressQuick').innerHTML = Object.entries(ADDRESS_LABELS)
    .map(([key, label]) => `<button type="button" data-random-input="address:${escapeHtml(key)}">${escapeHtml(label)}</button>`)
    .join('');
  $('tagQuick').innerHTML = QUICK_TAGS
    .map(tag => `<button class="quick-btn" data-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join('');
}

function switchHelperTab(name) {
  document.querySelectorAll('.mini-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.helper === name));
  $('helperInputPane').classList.toggle('active', name === 'input');
  $('helperDataPane').classList.toggle('active', name === 'data');
}

function applyInputValue(value, replace = false) {
  if (!value) return;
  const c = activeCase();
  if (!c) return;
  if ($('caseMode').value === 'multi') {
    c.conversation.messages = readChatMessages();
    c.conversation.messages.push({
      id: `msg_${Date.now()}`,
      role: 'student',
      content: value,
      delaySeconds: 3,
      attributes: {}
    });
    renderChatList(c.conversation.messages);
    toast('已添加为学员消息');
    return;
  }
  const old = $('singleInput').value.trim();
  $('singleInput').value = replace || !old ? value : `${old}\n${value}`;
  toast(replace ? '已应用 Input' : '已追加 Input');
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] || '';
}

function appendRandomInput(source) {
  const [kind, key] = String(source || '').split(':');
  const pool = kind === 'intent' ? QUICK_INTENTS[key] : QUICK_ADDRESS[key];
  const value = randomItem(pool || []);
  if (!value) return;
  const c = activeCase();
  if (!c) return;
  if ($('caseMode').value === 'multi') {
    const input = document.querySelector('.chat-card.selected .chat-composer-input');
    if (!input) return;
    input.value = input.value.trim() ? `${input.value.trim()} ${value}` : value;
  } else {
    const old = $('singleInput').value.trim();
    $('singleInput').value = old ? `${old} ${value}` : value;
  }
  toast(`已随机添加：${value}`);
}

function addTagValue(value) {
  if (!value) return;
  const tags = parseTags($('tagList').value);
  if (!tags.includes(value)) tags.push(value);
  $('tagList').value = tags.join('\n');
  toast('已添加 Tag');
}

function applyTagsValue(value) {
  const tags = parseTags(value);
  if (!tags.length) return;
  const current = parseTags($('tagList').value);
  tags.forEach(tag => {
    if (!current.includes(tag)) current.push(tag);
  });
  $('tagList').value = current.join('\n');
  toast('已应用 TagList');
}

function renderActualDataList() {
  $('actualDataList').innerHTML = state.actualRecords.length
    ? state.actualRecords.map((r, i) => `
      <div class="actual-item">
        <div class="actual-main">${escapeHtml(r.input)}</div>
        <div class="item-sub">Tag: ${escapeHtml(r.tags || '(无)')}</div>
        ${r.reply ? `<div class="item-sub">备注: ${escapeHtml(r.reply)}</div>` : ''}
        <div class="actual-actions">
          <button class="secondary" data-actual-input="${i}">应用 Input</button>
          <button class="secondary" data-actual-tags="${i}">应用 TagList</button>
        </div>
      </div>
    `).join('')
    : '<div class="item-sub">导入 CSV 后显示实际数据</div>';
}

function parseCSVRow(row) {
  const parts = [];
  let inQuote = false;
  let buf = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuote && row[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === ',' && !inQuote) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

async function importActualCsv(file) {
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter(Boolean);
  const dataRows = rows.slice(1);
  const records = dataRows.map(row => {
    const parts = parseCSVRow(row);
    return {
      input: (parts[0] || '').trim(),
      addTag: (parts[1] || '').trim(),
      reply: (parts[2] || '').trim(),
      tags: (parts[3] || '').trim()
    };
  }).filter(r => r.input);
  state.actualRecords = records;
  renderActualDataList();
  toast(`已导入 ${records.length} 条实际数据`);
}

function bindEvents() {
  history.replaceState({ page: 'case-list' }, '', window.location.href);
  window.addEventListener('popstate', async event => {
    const historyState = event.state || { page: 'case-list' };
    if (historyState.page === 'case-detail') {
      const c = state.cases.find(item => item.id === historyState.caseId);
      if (!c) {
        history.back();
        return;
      }
      if (state.casePage === 'detail' && historyState.caseId !== state.activeCaseId && !await confirmLeaveCaseEditor()) {
        history.back();
        return;
      }
      if (historyState.caseId !== state.activeCaseId) clearCaseEditing();
      state.activeCaseId = historyState.caseId;
      renderCaseList();
      showCaseDetail();
      return;
    }
    if (state.casePage !== 'detail') return;
    if (await confirmLeaveCaseEditor()) {
      clearCaseEditing();
      showCaseList();
      return;
    }
    history.go(1);
  });
  $('backToRecordsBtn').addEventListener('click', () => showRecordList());
  $('appendSingleMessageBtn').addEventListener('click', () => {
    const value = $('singleInput').value.trim();
    if (!value) {
      toast('请先输入学员最新消息', 'warning');
      return;
    }
    const c = activeCase();
    c.message.input = readSingleInputs();
    c.message.input.push(value);
    $('singleInput').value = '';
    renderSingleMessageList(c.message.input);
    toast('已添加发送内容');
  });
  $('jsonModeToggle').addEventListener('change', () => {
    setContentEditorMode($('jsonModeToggle').checked ? 'json' : 'message');
  });
  $('intentQuick').addEventListener('click', e => {
    const btn = e.target.closest('[data-random-input]');
    if (btn) appendRandomInput(btn.dataset.randomInput);
  });
  $('addressQuick').addEventListener('click', e => {
    const btn = e.target.closest('[data-random-input]');
    if (btn) appendRandomInput(btn.dataset.randomInput);
  });
  $('singleMessageList').addEventListener('click', e => {
    const btn = e.target.closest('.remove-single-input');
    if (!btn) return;
    const c = activeCase();
    c.message.input = readSingleInputs();
    c.message.input.splice(Number(btn.dataset.index), 1);
    renderSingleMessageList(c.message.input);
  });
  $('tagQuick').addEventListener('click', e => {
    const btn = e.target.closest('[data-tag-value]');
    if (btn) addTagValue(btn.dataset.tagValue);
  });
  $('addCourseTimeQuick').addEventListener('click', () => {
    const value = $('courseTimeQuick').value.trim();
    if (!value) return;
    addTagValue(value);
    $('courseTimeQuick').value = '';
  });
  $('caseMode').addEventListener('change', () => {
    const c = updateCaseFromForm();
    if (c) c.meta.mode = $('caseMode').value;
    renderModeEditors();
    renderAttrControls();
  });
  $('caseModeRadios').addEventListener('change', e => {
    const radio = e.target.closest('input[name="caseModeRadio"]');
    if (!radio) return;
    $('caseMode').value = radio.value;
    $('caseMode').dispatchEvent(new Event('change'));
  });
  $('sessionMode').addEventListener('change', () => {
    const c = activeCase();
    if (c) {
      c.session.mode = $('sessionMode').value;
      if ($('caseMode').value === 'multi') c.conversation.messages = readChatMessages();
    }
    renderAttrControls();
    if ($('caseMode').value === 'multi') renderChatList(c.conversation.messages);
  });
  $('sessionModeRadios').addEventListener('change', e => {
    const radio = e.target.closest('input[name="sessionModeRadio"]');
    if (!radio) return;
    $('sessionMode').value = radio.value;
    const c = activeCase();
    if (c) {
      c.session.mode = radio.value;
      if ($('caseMode').value === 'multi') c.conversation.messages = readChatMessages();
    }
    renderAttrControls();
    if ($('caseMode').value === 'multi') renderChatList(c.conversation.messages);
  });
  $('attrKey').addEventListener('change', () => {
    renderAttributeFieldSelect($('attrKey').value);
    renderAttrInput();
    $('attrValue').disabled = $('attrKey').disabled;
  });
  $('attrTarget').addEventListener('change', () => {
    const c = activeCase();
    if (!c) return;
    c.conversation.messages = readChatMessages();
    state.attrTargetMessageId = $('attrTarget').value || null;
    renderAttrControls();
  });
  $('addAttrBtn').addEventListener('click', () => {
    const c = activeCase();
    if (!c) return;
    const key = $('attrKey').value;
    const field = fieldByKey(key);
    const input = $('attrValue');
    const value = field?.type === 'tags' ? parseTags(input.value) : input.value;
    if (!key || !value || (Array.isArray(value) && !value.length)) return;
    if ($('sessionMode').value === 'perMessage') {
      c.conversation.messages = readChatMessages();
      const target = c.conversation.messages.find(m => m.id === state.attrTargetMessageId);
      if (!target) return;
      target.attributes ||= {};
      target.attributes[key] = value;
    } else {
      c.session.attributes[key] = value;
    }
    input.value = '';
    renderAttrControls();
  });
  $('attrList').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-attr]');
    const c = activeCase();
    if (btn && c) {
      if ($('sessionMode').value === 'perMessage') {
        c.conversation.messages = readChatMessages();
        const target = c.conversation.messages.find(m => m.id === state.attrTargetMessageId);
        if (target?.attributes) delete target.attributes[btn.dataset.removeAttr];
      } else {
        delete c.session.attributes[btn.dataset.removeAttr];
      }
      renderAttrControls();
    }
  });

  $('addStudentBtn').addEventListener('click', addChatMessage);
  $('chatList').addEventListener('click', e => {
    const card = e.target.closest('.chat-card');
    if (!card) return;
    const idx = Number(card.dataset.index);
    const c = activeCase();
    c.conversation.messages = readChatMessages();
    const randomBtn = e.target.closest('[data-random-input]');
    if (randomBtn) {
      appendRandomInput(randomBtn.dataset.randomInput);
      return;
    }
    if (e.target.closest('.add-card-input')) {
      const value = card.querySelector('.chat-composer-input').value.trim();
      if (!value) {
        toast('请先输入发送内容', 'warning');
        return;
      }
      c.conversation.messages[idx].input.push(value);
      renderChatList(c.conversation.messages);
      return;
    }
    if (e.target.closest('.remove-card-input')) {
      c.conversation.messages[idx].input.splice(Number(e.target.closest('.remove-card-input').dataset.inputIndex), 1);
      renderChatList(c.conversation.messages);
      return;
    }
    if (e.target.closest('.remove-chat')) {
      c.conversation.messages.splice(idx, 1);
      state.selectedMessageId = c.conversation.messages[0]?.id || null;
      renderChatList(c.conversation.messages);
      renderAttrControls();
      return;
    }
    if (e.target.closest('.move-up') && idx > 0) {
      const [m] = c.conversation.messages.splice(idx, 1);
      c.conversation.messages.splice(idx - 1, 0, m);
      renderChatList(c.conversation.messages);
      renderAttrControls();
      return;
    }
    if (!e.target.closest('textarea') && !e.target.closest('button')) {
      state.selectedMessageId = card.dataset.id;
      renderChatList(c.conversation.messages);
    }
  });

  document.addEventListener('case-detail-ui-ready', syncCaseDetailChrome);
  document.addEventListener('case-editor-ui-ready', renderEditor);
  document.addEventListener('record-detail-action', e => {
    if (e.detail?.type === 'back') showRecordList();
    if (e.detail?.type === 'append-message') appendMessageToActiveRecord().catch(showError);
  });
  document.addEventListener('list-page-ui-ready', renderListToolbars);
  document.addEventListener('list-toolbar-action', e => {
    const { type, value, file, format, id, confirmed, date, fileName, ids, pageIds, pageNo, pageSize, agentId, mqConfigId, config, field, order, labelType, action, name, names, replacement, backupId } = e.detail || {};
    if (type === 'new-case') createCase().catch(showError);
    if (type === 'import-case' && file) importTestCaseFile(file, format).catch(showError);
    if (type === 'export-cases') exportCases();
    if (type === 'batch-edit') batchEditSelectedCases().catch(showError);
    if (type === 'batch-send') requestBatchSend().catch(showError);
    if (type === 'delete-case') deleteCaseById(id, { confirmed }).catch(showError);
    if (type === 'duplicate-case') duplicateCaseById(id).catch(showError);
    if (type === 'delete-selected-cases') deleteSelectedCases().catch(showError);
    if (type === 'refresh-records') loadRecords().catch(showError);
    if (type === 'switch-view') requestViewChange(value).catch(showError);
    if (type === 'open-case') switchCaseEditor(id).catch(showError);
    if (type === 'send-case') requestSendCaseById(id).catch(showError);
    if (type === 'open-mq-settings') openMqSettings().catch(showError);
    if (type === 'close-mq-settings') closeMqSettings();
    if (type === 'save-mq-config') saveMqConfig(config).catch(showError);
    if (type === 'open-update-dialog') openUpdateDialog().catch(showError);
    if (type === 'close-update-dialog') closeUpdateDialog();
    if (type === 'check-update') checkForUpdate().catch(showError);
    if (type === 'apply-online-update') applyOnlineUpdate().catch(showError);
    if (type === 'rollback-online-update') rollbackOnlineUpdate(backupId).catch(showError);
    if (type === 'open-record') showRecord(date, fileName).catch(showError);
    if (type === 'manage-label-item') manageLabelItem(labelType, action, name, replacement).catch(showError);
    if (type === 'delete-selected-label-items') deleteSelectedLabelItems(labelType, names).catch(showError);
    if (type === 'set-case-selection') {
      (pageIds || []).forEach(caseId => state.selectedCases.delete(caseId));
      (ids || []).forEach(caseId => state.selectedCases.add(caseId));
      renderCaseList();
    }
    if (type === 'set-case-page') {
      state.casePageNo = pageNo;
      if (pageSize !== state.casePageSize) state.casePageSize = pageSize;
      renderCaseList();
    }
    if (type === 'set-case-sort') {
      state.caseSort = { field: order ? field : '', order: order || null };
      state.casePageNo = 1;
      renderCaseList();
    }
    if (type === 'set-record-page') {
      state.recordPageNo = pageNo;
      renderRecordList();
    }
    if (type === 'create-agent-id') createAgentId(agentId).catch(showError);
    if (type === 'cancel-send') closeSendDialog();
    if (type === 'confirm-send') confirmSend(agentId, mqConfigId).catch(showError);
  });
  document.addEventListener('list-toolbar-change', e => {
    const { type, value } = e.detail || {};
    if (type === 'case-search') {
      state.caseSearch = value || '';
      state.casePageNo = 1;
      renderCaseList();
    }
    if (type === 'case-scenario') {
      state.caseScenarioFilter = value || '';
      state.casePageNo = 1;
      renderCaseList();
    }
    if (type === 'record-search') {
      state.recordSearch = value || '';
      state.recordPageNo = 1;
      renderRecordList();
    }
    if (type === 'record-trigger-message') {
      state.recordTriggerMessage = value || '';
      state.recordPageNo = 1;
      renderRecordList();
    }
    if (type === 'record-wework-corp-id') {
      state.recordWeworkCorpId = value || '';
      state.recordPageNo = 1;
      renderRecordList();
    }
    if (type === 'record-friend-nick') {
      state.recordFriendNick = value || '';
      state.recordPageNo = 1;
      renderRecordList();
    }
    if (type === 'record-clear-advanced-filters') {
      state.recordTriggerMessage = '';
      state.recordWeworkCorpId = '';
      state.recordFriendNick = '';
      state.recordPageNo = 1;
      renderRecordList();
    }
  });
  document.addEventListener('case-detail-action', e => {
    const { type, name, note } = e.detail || {};
    if (type === 'back') {
      leaveCaseEditor().catch(showError);
      return;
    }
    if (type === 'meta-change') {
      const c = activeCase();
      if (!c) return;
      $('caseName').value = name;
      $('expectedResult').value = note;
      c.meta.name = name.trim() || '未命名用例';
      c.meta.expectedResult = note;
      renderCaseList();
      syncCaseDetailChrome();
      return;
    }
    const actions = {
      save: saveActiveCase,
      send: requestSendActiveCase,
      duplicate: duplicateCaseFromEditor,
      delete: deleteCase
    };
    if (actions[type]) actions[type]().catch(showError);
  });
}

function addChatMessage() {
  const c = activeCase();
  if (!c) return;
  c.conversation.messages = readChatMessages();
  const id = `msg_${Date.now()}`;
  c.conversation.messages.push({
    id,
    role: 'student',
    input: [],
    delaySeconds: Number($('multiIntervalSeconds').value || 3),
    attributes: {}
  });
  state.selectedMessageId = id;
  renderChatList(c.conversation.messages);
  renderAttrControls();
}

bindEvents();
loadInitial().catch(err => {
  console.error(err);
  showError(err);
});
