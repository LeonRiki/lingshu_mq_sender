import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, DatePicker, Drawer, Flex, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { CopyOutlined, DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

function copyCase(value) {
  return JSON.parse(JSON.stringify(value));
}

const QUICK_MESSAGE_GROUPS = [
  {
    title: '常见意图',
    items: [
      { label: '确认收到', values: ['收到', '收到老师', '收到了，谢谢老师，您辛苦了！', '收到谢谢', '好的', '好的，老师', '没问题', '已成功'] },
      { label: '加好友确认', values: ['我已经添加了你，现在我们可以开始聊天了。', '已加', '老师好，我看到提示就加上你了'] },
      { label: '方便上课', values: ['方便', '方便。', '有时间', '方便听课', '准时到课。', '收到老师，明天我会参加学习的'] },
      { label: '暂不方便', values: ['正是吃饭时间，不太方便', '还未有时间。', '收到，今天没时间看', '在回家的路上开车', '现在在忙，晚点弄'] },
      { label: '资料领取', values: ['老师，领资料怎么领？', '老师，你发资料我看看', '看不到红卡片', '老师直播间里的手稿资料怎样领，看不到红卡片'] },
      { label: '回放开课', values: ['能回放吗课程', '可以看回放吗？', '最好第二天上午重播。', '上课哪天开始？'] },
      { label: '物流收货', values: ['快递到了吗？怎么还没收到', '前天买的课本，还没收到信息', '我收到了，字都写好了'] },
      { label: '学习基础', values: ['我没啥基础，先看看可以', '我完全是零基础，手抖得厉害，能学会吗', '我没有任何工具做画', '我也搞了三十多年的对联了'] },
      { label: '暂缓婉拒', values: ['我有工具了，不需要寄', '我不需要发任何笔墨', '真的不需要，别再问了', '不用了，我自己买就行'] },
      { label: '退课不进班', values: ['这个课程不太适合我，能退款吗', '老师好，我想退一下课程', '老师，上了几节课觉得跟不上，可以退吗', '我已经学过了，就不进班了，谢谢老师'] }
    ]
  },
  {
    title: '用户信息',
    items: [
      { label: '姓名', values: ['张三', '李四', '王五', '赵六'] },
      { label: '手机号', values: ['13800138001', '13900139002', '15000150003', '18600136004'] },
      { label: '地区', values: ['北京市朝阳区', '上海市浦东新区', '广州市天河区', '深圳市南山区'] },
      { label: '详细地址', values: ['中关村大街1号创新大厦1203室', '望京SOHO T1-B座2206', '五道口华清嘉园8号楼3单元502'] }
    ]
  }
];
const JSON_NAMES = ['李', '王', '张', '陈', '刘', '赵', '周', '吴'];
const JSON_NICKS = ['好客迎客松', '清风徐来', '晴空万里', '春暖花开'];

function itemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function messageItem(content = '') {
  return { id: itemId('message'), type: 'message', content: String(content) };
}

function delayItem(seconds = 50) {
  return { id: itemId('delay'), type: 'delay', seconds: normalizeDelaySeconds(seconds) };
}

function normalizeDelaySeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(40, seconds) : null;
}

function historyItem(role = 'student', content = '', prefix = '') {
  return { id: itemId('history'), type: 'history', role, prefix, content: String(content) };
}

function historyItemsFromInputList(inputList) {
  return (Array.isArray(inputList) ? inputList : []).map((value, index) => {
    const raw = String(value || '');
    const delimiter = raw.indexOf(':');
    const prefix = delimiter >= 0 ? raw.slice(0, delimiter) : '';
    const content = delimiter >= 0 ? raw.slice(delimiter + 1) : raw;
    const role = prefix.startsWith('168885') ? 'teacher' : 'student';
    return { id: `history_${index}_${raw.length}`, type: 'history', role, prefix, content };
  }).filter(item => item.content.trim());
}

function inputListFromHistoryItems(items) {
  return (Array.isArray(items) ? items : []).map(item => {
    const prefix = item.prefix || (item.role === 'teacher' ? '1688850000000000' : 'student');
    return `${prefix}:${item.content}`;
  });
}

function normalizeFlow(flow) {
  const next = [];
  (Array.isArray(flow) ? flow : []).forEach(item => {
    if (item?.type === 'message') {
      const content = String(item.content ?? '');
      if (content.trim()) next.push({ id: item.id || itemId('message'), type: 'message', content });
      return;
    }
    if (item?.type === 'delay' && next.length && next.at(-1).type === 'message') {
      next.push({ id: item.id || itemId('delay'), type: 'delay', seconds: normalizeDelaySeconds(item.seconds) });
    }
  });
  return next.at(-1)?.type === 'delay' ? next.slice(0, -1) : next;
}

function isValidFlow(flow) {
  return flow.length > 0 && flow[0].type === 'message' && flow.at(-1).type === 'message' && flow.every((item, index) => item.type === 'message' || (index > 0 && index < flow.length - 1 && flow[index - 1].type === 'message' && flow[index + 1].type === 'message'));
}

function flowFromCase(caseData) {
  const flow = caseData.conversation?.flow;
  if (Array.isArray(flow) && flow.length) return normalizeFlow(flow);
  if (caseData.meta?.mode === 'multi') {
    const legacy = caseData.conversation?.messages || [];
    const converted = [];
    legacy.forEach((request, requestIndex) => {
      const inputs = Array.isArray(request.input) ? request.input : [];
      if (requestIndex > 0 && converted.length && inputs.length) converted.push(delayItem(request.delaySeconds ?? caseData.conversation?.intervalSeconds ?? 50));
      inputs.forEach(content => converted.push(messageItem(content)));
    });
    if (!converted.length) {
      (caseData.message?.input || []).forEach((content, index) => {
        if (index) converted.push(delayItem(caseData.conversation?.intervalSeconds ?? 50));
        converted.push(messageItem(content));
      });
    }
    return normalizeFlow(converted);
  }
  return normalizeFlow((caseData.message?.input || []).map(content => messageItem(content)));
}

function groupsFromFlow(flow) {
  const groups = [];
  let current = [];
  normalizeFlow(flow).forEach(item => {
    if (item.type === 'message') current.push(item);
    else if (current.length) {
      groups.push({ messages: current, delaySeconds: item.seconds });
      current = [];
    }
  });
  if (current.length) groups.push({ messages: current, delaySeconds: 0 });
  return groups;
}

function hasSessionConfiguration(caseData, config) {
  if (caseData.session?.enabled !== undefined) return caseData.session.enabled;
  return ['friendNick', 'latestMsgTime', 'addTime'].some(field => Boolean(caseData.message?.[field])) ||
    (Boolean(caseData.message?.weworkAccountAlias) && caseData.message?.weworkAccountAlias !== config?.defaultAlias) ||
    Object.keys(caseData.session?.attributes || {}).length > 0;
}

function randomDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function currentDateTime() {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatProtocolDate(value) {
  return String(value || '').replace('T', ' ').slice(0, 19);
}

function protocolTags(value) {
  return Array.isArray(value) ? [...value] : String(value || '').split(/[，,;\n]/).map(item => item.trim()).filter(Boolean);
}

function buildProtocol(caseData, config) {
  const message = caseData.message || {};
  const session = caseData.session || {};
  const groups = groupsFromFlow(flowFromCase(caseData));
  const useSessionConfiguration = session.enabled !== false;
  const shared = {
    weworkCorpId: `ww${randomString(8).toLowerCase()}`,
    weworkAccount: `${JSON_NAMES[Math.floor(Math.random() * JSON_NAMES.length)]}${randomDigits(2)}Teacher`,
    friendExternalId: `${randomString(16)}${randomDigits(4)}${randomString(8)}`,
    friendRemoteId: `788130${randomDigits(10)}`
  };
  const aliasesByCorp = new Map();
  const nicksByFriendExternalId = new Map();
  const attributesFor = group => !useSessionConfiguration ? {} : (session.mode === 'perMessage' ? (group.messages[0]?.attributes || {}) : (session.attributes || {}));
  const makePayload = (group, inputList, sequence) => {
    const attributes = attributesFor(group);
    const value = (field, fallback) => useSessionConfiguration && attributes[field] !== undefined && attributes[field] !== null && attributes[field] !== '' ? attributes[field] : (useSessionConfiguration && message[field] !== undefined && message[field] !== null && message[field] !== '' ? message[field] : fallback);
    const payload = {
      requestId: `${shared.weworkCorpId}_${JSON_NAMES[Math.floor(Math.random() * JSON_NAMES.length)]}_${randomDigits(14)}_${Date.now()}_${sequence}`,
      input: group.messages.map(item => item.content),
      latestMsgTime: formatProtocolDate(value('latestMsgTime', currentDateTime())),
      weworkCorpId: shared.weworkCorpId,
      agentId: config?.defaultAgentId || 'testId',
      addTime: formatProtocolDate(value('addTime', currentDateTime())),
      weworkAccount: shared.weworkAccount,
      friendNick: value('friendNick', JSON_NICKS[Math.floor(Math.random() * JSON_NICKS.length)]),
      friendExternalId: shared.friendExternalId,
      tagList: protocolTags(attributes.tagList ?? message.tagList),
      inputList: [...inputList],
      weworkAccountAlias: value('weworkAccountAlias', config?.defaultAlias || '汪洋老师'),
      friendRemoteId: shared.friendRemoteId
    };
    if (!aliasesByCorp.has(payload.weworkCorpId)) aliasesByCorp.set(payload.weworkCorpId, payload.weworkAccountAlias);
    payload.weworkAccountAlias = aliasesByCorp.get(payload.weworkCorpId);
    if (!nicksByFriendExternalId.has(payload.friendExternalId)) nicksByFriendExternalId.set(payload.friendExternalId, payload.friendNick);
    payload.friendNick = nicksByFriendExternalId.get(payload.friendExternalId);
    return payload;
  };
  const history = [...(message.inputList || [])];
  const payloads = groups.map((group, index) => {
    const payload = makePayload(group, history, index + 1);
    group.messages.forEach(item => history.push(`${payload.friendRemoteId}:${item.content}`));
    return payload;
  });
  if (!payloads.length) return makePayload({ messages: [] }, history, 1);
  return payloads.length === 1 ? payloads[0] : payloads;
}

function MessageFlowPreview({ history, flow }) {
  const historyMessages = history.map(value => {
    const raw = String(value || '');
    const delimiter = raw.indexOf(':');
    return { content: delimiter >= 0 ? raw.slice(delimiter + 1) : raw, role: delimiter >= 0 && raw.slice(0, delimiter).startsWith('168885') ? 'teacher' : 'student' };
  });
  return <aside className="message-flow-preview" aria-label="消息流预览">
    {historyMessages.length ? <section className="message-flow-preview-section"><Text className="message-flow-preview-label">历史消息（inputList）</Text>{historyMessages.map((message, index) => <div className={`message-flow-bubble ${message.role}`} key={`${message.role}-${index}`}><span>{message.content}</span></div>)}</section> : null}
    {normalizeFlow(flow).map(item => item.type === 'delay'
      ? <div className="message-flow-wait" key={item.id}>{item.seconds === null ? '请填写发送间隔' : `等待 ${item.seconds} 秒后发送`}</div>
      : <div className="message-flow-bubble student" key={item.id}><span>{item.content}</span></div>)}
  </aside>;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function highlightJson(value) {
  const source = String(value ?? '');
  const pattern = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const token = match[0];
    result += escapeHtml(source.slice(lastIndex, match.index));
    let className = 'json-token-number';
    if (token.startsWith('"')) className = match[2] ? 'json-token-key' : 'json-token-string';
    else if (token === 'true' || token === 'false') className = 'json-token-boolean';
    else if (token === 'null') className = 'json-token-null';
    result += `<span class="${className}">${escapeHtml(token)}</span>`;
    lastIndex = match.index + token.length;
  }
  result += escapeHtml(source.slice(lastIndex));
  return result || '<br />';
}

function JsonCodeEditor({ value, onChange, onBlur }) {
  const highlightRef = useRef(null);
  const syncScroll = event => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  return <div className="json-code-editor">
    <pre ref={highlightRef} className="json-code-highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightJson(value) }} />
    <textarea className="json-code-input" value={value} onChange={onChange} onBlur={onBlur} onScroll={syncScroll} spellCheck={false} />
  </div>;
}

function HistoryMessageEditor({ historyItems, onChange }) {
  const [composer, setComposer] = useState(null);
  const inputRef = useRef(null);
  const history = Array.isArray(historyItems) ? historyItems : [];
  useEffect(() => {
    if (!composer) return;
    window.requestAnimationFrame(() => {
      const input = inputRef.current?.resizableTextArea?.textArea;
      if (!input) return;
      input.focus();
      if (composer.mode === 'edit') {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }, [composer?.id, composer?.mode]);
  const saveComposer = () => {
    const content = composer?.value?.trim();
    const next = composer?.mode === 'edit'
      ? (content ? history.map(item => item.id === composer.id ? { ...item, content } : item) : history.filter(item => item.id !== composer.id))
      : (content ? [...history, historyItem(composer.role, content)] : history);
    onChange(next);
    setComposer(null);
  };
  const renderComposer = className => <div className={`message-flow-composer ${className || ''}`}>
    <Input.TextArea ref={inputRef} autoFocus autoSize={{ minRows: 1, maxRows: 4 }} value={composer?.value || ''} placeholder="输入历史消息" onBlur={saveComposer} onChange={event => setComposer(current => ({ ...current, value: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveComposer(); } }} />
  </div>;
  const renderActions = item => <Space size={0} className="message-flow-bubble-actions">
    <Tooltip title="编辑历史消息"><Button type="text" size="small" icon={<EditOutlined />} aria-label="编辑历史消息" onClick={() => setComposer({ mode: 'edit', id: item.id, role: item.role, value: item.content })} /></Tooltip>
    <Tooltip title="删除历史消息"><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="删除历史消息" onClick={() => onChange(history.filter(current => current.id !== item.id))} /></Tooltip>
  </Space>;
  return <div className="history-message-editor">
    <div className="history-message-editor-list">
      {history.map(item => composer?.mode === 'edit' && composer.id === item.id ? <div className={`message-flow-edit-slot message-flow-history-edit-slot ${item.role}`} key={item.id}>
        {renderComposer('message-flow-composer-inline')}
      </div> : <div className={`message-flow-editable-bubble message-flow-history-bubble ${item.role}`} key={item.id}>
        {item.role === 'teacher' ? <><div className={`message-flow-bubble ${item.role}`}><span>{item.content}</span></div>{renderActions(item)}</> : <>{renderActions(item)}<div className={`message-flow-bubble ${item.role}`}><span>{item.content}</span></div></>}
      </div>)}
      {composer?.mode === 'add' ? <div className={`message-flow-history-add-slot ${composer.role}`}>
        {renderComposer('message-flow-composer-history')}
      </div> : null}
    </div>
    <div className="history-message-editor-actions">
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => setComposer({ mode: 'add', role: 'teacher', value: '' })}>添加老师消息</Button>
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => setComposer({ mode: 'add', role: 'student', value: '' })}>添加学员消息</Button>
    </div>
  </div>;
}

function MessageFlowBuilder({ flow, historyItems, availableCases, currentCaseId, onFlowAndHistoryChange }) {
  const [composer, setComposer] = useState(null);
  const [draggingId, setDraggingId] = useState('');
  const [dropIndicator, setDropIndicator] = useState(null);
  const [historyEditorOpen, setHistoryEditorOpen] = useState(false);
  const composerInputRef = useRef(null);
  const normalized = normalizeFlow(flow);
  const history = Array.isArray(historyItems) ? historyItems : [];
  const messageCount = normalized.filter(item => item.type === 'message').length;
  const canAddDelay = normalized.some((item, index) => item.type === 'message' && normalized[index + 1]?.type === 'message');
  const reusableCases = (Array.isArray(availableCases) ? availableCases : []).filter(item => item.id !== currentCaseId).map(item => ({
    id: item.id,
    name: item.meta?.name || '未命名用例',
    messages: normalizeFlow(flowFromCase(item)).filter(flowItem => flowItem.type === 'message').map(flowItem => flowItem.content)
  })).filter(item => item.messages.length);
  const commit = (nextFlow, nextHistory = history) => onFlowAndHistoryChange(normalizeFlow(nextFlow), nextHistory);
  useEffect(() => {
    if (!composer) return;
    window.requestAnimationFrame(() => {
      const input = composerInputRef.current?.resizableTextArea?.textArea;
      if (!input) return;
      input.focus();
      if (composer.mode === 'edit') {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
    });
  }, [composer?.id, composer?.mode]);
  const saveComposer = () => {
    const content = composer?.value?.trim();
    if (composer?.target === 'history') {
      const nextHistory = composer.mode === 'edit'
        ? (content ? history.map(item => item.id === composer.id ? { ...item, content } : item) : history.filter(item => item.id !== composer.id))
        : (content ? [...history, historyItem(composer.role, content)] : history);
      commit(normalized, nextHistory);
    } else if (composer?.mode === 'edit') {
      commit(content ? normalized.map(item => item.id === composer.id ? { ...item, content } : item) : normalized.filter(item => item.id !== composer.id));
    } else if (content) {
      commit([...normalized, messageItem(content)]);
    }
    setComposer(null);
  };
  const addDelay = () => {
    for (let index = normalized.length - 1; index > 0; index--) {
      if (normalized[index].type === 'message' && normalized[index - 1].type === 'message') {
        commit([...normalized.slice(0, index), delayItem(), ...normalized.slice(index)]);
        return;
      }
    }
  };
  const buildMovedFlow = (sourceId, targetId, placement) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceIndex = normalized.findIndex(item => item.id === sourceId);
    const targetIndex = normalized.findIndex(item => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...normalized];
    const [moving] = next.splice(sourceIndex, 1);
    const nextTargetIndex = next.findIndex(item => item.id === targetId);
    next.splice(placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, moving);
    return isValidFlow(next) ? next : null;
  };
  const moveItem = (sourceId, targetId, placement) => {
    const next = buildMovedFlow(sourceId, targetId, placement);
    if (next) commit(next);
  };
  const onDragStart = (event, id) => {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };
  const getDropPlacement = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  };
  const onDragOverItem = (event, targetId) => {
    event.preventDefault();
    const placement = getDropPlacement(event);
    const sourceId = draggingId || event.dataTransfer.getData('text/plain');
    setDropIndicator(buildMovedFlow(sourceId, targetId, placement) ? { targetId, placement } : null);
  };
  const onDropItem = (event, targetId) => {
    event.preventDefault();
    const placement = getDropPlacement(event);
    const sourceId = event.dataTransfer.getData('text/plain');
    moveItem(sourceId, targetId, placement);
    setDraggingId('');
    setDropIndicator(null);
  };
  const onDragEnd = () => { setDraggingId(''); setDropIndicator(null); };
  const dropClass = id => dropIndicator?.targetId === id ? ` drop-${dropIndicator.placement}` : '';
  const addQuickMessage = values => {
    const value = values[Math.floor(Math.random() * values.length)];
    if (!value) return;
    setComposer(null);
    commit([...normalized, messageItem(value)]);
  };
  const addCaseMessages = messages => {
    setComposer(null);
    commit([...normalized, ...messages.map(content => messageItem(content))]);
  };
  const quickMessageContent = <div className="message-quick-tab-content">
    {QUICK_MESSAGE_GROUPS.map(group => <section className="message-quick-group" key={group.title}>
      <Text className="message-quick-group-title">{group.title}</Text>
      <div className="message-quick-options">
        {group.items.map(item => <Button key={item.label} size="small" shape="round" onClick={() => addQuickMessage(item.values)}>{item.label}</Button>)}
      </div>
    </section>)}
  </div>;
  const otherCaseContent = <div className="message-case-options">
    {reusableCases.length ? reusableCases.map(item => <Button key={item.id} className="message-case-option" title={`${item.name}\n${item.messages[0]}`} onClick={() => addCaseMessages(item.messages)}>
      <span className="message-case-content">
        <span className="message-case-name">{item.name}</span>
        <span className="message-case-preview">{item.messages[0]}</span>
      </span>
    </Button>) : <Text type="secondary" className="message-quick-empty">暂无其他用例</Text>}
  </div>;
  const renderComposer = className => <div className={`message-flow-composer ${className || ''}`}>
    <Input.TextArea ref={composerInputRef} autoFocus autoSize={{ minRows: 1, maxRows: 4 }} value={composer?.value || ''} placeholder="输入消息" onBlur={saveComposer} onChange={event => setComposer(current => ({ ...current, value: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveComposer(); } }} />
  </div>;

  return <div className="message-flow-builder">
    <div className="message-flow-canvas">
      <div className="message-flow-items">
        {history.map(item => <div className={`message-flow-history-display ${item.role}`} key={item.id}>
          <div className={`message-flow-bubble ${item.role}`}><span>{item.content}</span></div>
        </div>)}
        <div className="message-history-divider">
          <span />
          <div className="message-history-divider-center">
            <Text type="secondary" className="message-history-divider-label">以上为历史消息</Text>
            <Button type="link" size="small" onClick={() => setHistoryEditorOpen(true)}>编辑历史消息</Button>
          </div>
          <span />
        </div>
        {normalized.map(item => item.type === 'delay' ? <div className={`message-delay-row ${draggingId === item.id ? 'is-dragging' : ''}${dropClass(item.id)}`} key={item.id} draggable onDragStart={event => onDragStart(event, item.id)} onDragOver={event => onDragOverItem(event, item.id)} onDragLeave={() => setDropIndicator(null)} onDrop={event => onDropItem(event, item.id)} onDragEnd={onDragEnd}>
          <HolderOutlined />
          <Text type="secondary">发送间隔</Text>
          <InputNumber min={40} precision={0} value={item.seconds} onChange={seconds => commit(normalized.map(current => current.id === item.id ? { ...current, seconds: normalizeDelaySeconds(seconds) } : current))} />
          <Text type="secondary">秒</Text>
          <Text type="secondary" className="message-delay-hint">{item.seconds === null ? '请填写发送间隔' : `${item.seconds}秒后发送下方消息`}</Text>
          <Tooltip title="删除发送间隔"><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="删除发送间隔" onClick={() => commit(normalized.filter(current => current.id !== item.id))} /></Tooltip>
        </div> : composer?.mode === 'edit' && composer.id === item.id ? <div className="message-flow-edit-slot" key={item.id}>
          {renderComposer('message-flow-composer-inline')}
        </div> : <div className={`message-flow-editable-bubble ${draggingId === item.id ? 'is-dragging' : ''}${dropClass(item.id)}`} key={item.id} draggable onDragStart={event => onDragStart(event, item.id)} onDragOver={event => onDragOverItem(event, item.id)} onDragLeave={() => setDropIndicator(null)} onDrop={event => onDropItem(event, item.id)} onDragEnd={onDragEnd}>
          <Space size={0} className="message-flow-bubble-actions">
            <Tooltip title="编辑消息"><Button type="text" size="small" icon={<EditOutlined />} aria-label="编辑消息" onClick={() => setComposer({ mode: 'edit', id: item.id, value: item.content })} /></Tooltip>
            <Tooltip title="删除消息"><Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="删除消息" onClick={() => commit(normalized.filter(current => current.id !== item.id))} /></Tooltip>
          </Space>
          <div className="message-flow-bubble student"><span>{item.content}</span></div>
        </div>)}
        {composer?.mode === 'add' ? <div className="message-flow-add-slot">
          {renderComposer('message-flow-composer-add')}
        </div> : <div className="message-flow-add-actions">
          <Tooltip title={messageCount < 2 ? '至少添加两条消息后才能设置间隔' : (!canAddDelay ? '所有相邻消息之间均已有发送间隔' : '')}><Button type="dashed" icon={<PlusOutlined />} disabled={!canAddDelay} onClick={addDelay}>添加发送间隔</Button></Tooltip>
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => setComposer({ mode: 'add', value: '' })}>添加消息</Button>
        </div>}
      </div>
    </div>
    <aside className="message-quick-builder" aria-label="快捷构建消息">
      <Tabs className="message-quick-tabs" size="small" items={[
        { key: 'quick', label: '快捷消息', children: quickMessageContent },
        { key: 'cases', label: '其他用例', children: otherCaseContent }
      ]} />
    </aside>
    <Drawer open={historyEditorOpen} title="编辑历史消息" width="min(960px, calc(100vw - 48px))" destroyOnHidden onClose={() => setHistoryEditorOpen(false)}>
      <HistoryMessageEditor historyItems={history} onChange={nextHistory => commit(normalized, nextHistory)} />
    </Drawer>
  </div>;
}

function CaseEditor({ caseData, cases, scenarios, archivedScenarios = [], userTags, archivedUserTags = [], config }) {
  const [model, setModel] = useState(() => copyCase(caseData));
  const modelRef = useRef(model);
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [jsonMode, setJsonMode] = useState(false);
  const [messageJsonBlocks, setMessageJsonBlocks] = useState([]);
  const [messageJsonError, setMessageJsonError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sessionConfigEnabled, setSessionConfigEnabled] = useState(() => hasSessionConfiguration(caseData, config));

  useEffect(() => {
    const nextModel = copyCase(caseData);
    modelRef.current = nextModel;
    setModel(nextModel);
    setJsonMode(false);
    setMessageJsonBlocks([]);
    setMessageJsonError('');
    setPreviewOpen(false);
    setSessionConfigEnabled(hasSessionConfiguration(caseData, config));
  }, [caseData.id]);
  useEffect(() => {
    const getBusinessScenario = caseId => caseId === modelRef.current.id ? modelRef.current.meta.businessScenario : undefined;
    window.getCaseEditorBusinessScenario = getBusinessScenario;
    return () => { if (window.getCaseEditorBusinessScenario === getBusinessScenario) delete window.getCaseEditorBusinessScenario; };
  }, [caseData.id]);

  const commit = update => {
    const next = typeof update === 'function' ? update(modelRef.current) : update;
    modelRef.current = next;
    setModel(next);
    window.updateCaseFromEditor?.(next);
  };
  const patch = change => commit(current => ({ ...current, ...change }));
  const patchMeta = change => commit(current => ({ ...current, meta: { ...current.meta, ...change } }));
  const patchMessage = change => commit(current => ({ ...current, message: { ...current.message, ...change } }));
  const flow = flowFromCase(model);
  const historyItems = historyItemsFromInputList(model.message.inputList || []);
  const setFlowAndHistory = (nextFlow, nextHistory = historyItems) => {
    const normalized = normalizeFlow(nextFlow);
    const groups = groupsFromFlow(normalized);
    patch({
      meta: { ...model.meta, mode: normalized.some(item => item.type === 'delay') ? 'multi' : 'single' },
      message: { ...model.message, input: groups[0]?.messages.map(item => item.content) || [], inputList: inputListFromHistoryItems(nextHistory) },
      conversation: { ...model.conversation, flow: normalized, messages: [] }
    });
  };
  const setBusinessScenario = value => { patchMeta({ businessScenario: String(value || '').trim() }); setScenarioSearch(''); };
  const createBusinessScenario = async () => {
    const value = scenarioSearch.trim();
    if (!value) return;
    setBusinessScenario(value);
    await window.saveCaseLabels?.({ businessScenarios: [value] });
  };
  const setTagList = values => {
    const currentTags = modelRef.current.message.tagList || [];
    const tags = values.map(value => String(value || '').trim()).filter(Boolean)
      .filter(tag => !archivedUserTags.includes(tag) || currentTags.includes(tag));
    patchMessage({ tagList: tags });
    const newTags = tags.filter(tag => ![...userTags, ...archivedUserTags].includes(tag));
    if (newTags.length) window.saveCaseLabels?.({ userTags: newTags });
  };
  const scenarioOptions = useMemo(() => {
    const search = scenarioSearch.trim();
    return [...new Set([...scenarios, model.meta.businessScenario].filter(Boolean))].filter(value => !search || value.includes(search)).map(value => ({ value, label: value }));
  }, [model.meta.businessScenario, scenarioSearch, scenarios]);
  const canCreateScenario = scenarioSearch.trim() && ![...scenarios, ...archivedScenarios, model.meta.businessScenario].filter(Boolean).includes(scenarioSearch.trim());
  const sessionFields = [['friendNick', '好友昵称', 'text'], ['weworkAccountAlias', '企微账号别名', 'text'], ['latestMsgTime', '最新消息时间', 'datetime'], ['addTime', '添加时间', 'datetime']];
  const jsonGroups = groupsFromFlow(flow);
  const jsonPayloadBlocks = currentModel => {
    const payload = buildProtocol(currentModel, config);
    return (Array.isArray(payload) ? payload : [payload]).map(item => JSON.stringify(item, null, 2));
  };
  const applyMessageJsonBlocks = nextBlocks => {
    try {
      const payloads = nextBlocks.map(block => JSON.parse(block));
      const nextFlow = [];
      payloads.forEach((payload, index) => {
        (Array.isArray(payload.input) ? payload.input : []).forEach(content => {
          if (String(content || '').trim()) nextFlow.push(messageItem(content));
        });
        if (index < payloads.length - 1) nextFlow.push(delayItem(jsonGroups[index]?.delaySeconds ?? 50));
      });
      if (!nextFlow.some(item => item.type === 'message')) throw new Error('至少保留一条 input 消息');
      const nextHistory = historyItemsFromInputList(payloads[0]?.inputList || []);
      setFlowAndHistory(nextFlow, nextHistory);
      setMessageJsonError('');
    } catch (error) {
      setMessageJsonError(error?.message || 'JSON 格式不正确');
    }
  };
  const updateJsonBlock = (index, value) => {
    setMessageJsonBlocks(current => current.map((item, itemIndex) => itemIndex === index ? value : item));
  };
  const setJsonModeEnabled = enabled => {
    if (enabled) {
      setMessageJsonBlocks(jsonPayloadBlocks(model));
      setMessageJsonError('');
    }
    if (!enabled) setPreviewOpen(false);
    setJsonMode(enabled);
  };

  return <section className="case-flow-editor">
    <section className="flow-section">
      <Title level={5}>用例信息</Title>
      <div className="flow-info-grid">
        <label>测试场景名称<Input value={model.meta.name} onChange={event => patchMeta({ name: event.target.value })} onBlur={() => patchMeta({ name: model.meta.name.trim() || '未命名用例' })} /></label>
        <label>业务场景<Select showSearch allowClear filterOption={false} value={model.meta.businessScenario || undefined} placeholder="选择或创建业务场景" searchValue={scenarioSearch} onSearch={setScenarioSearch} options={scenarioOptions} onChange={setBusinessScenario} onClear={() => setBusinessScenario('')} popupRender={origin => <>{origin}{canCreateScenario ? <Button type="link" block onMouseDown={event => event.preventDefault()} onClick={createBusinessScenario}>创建“{scenarioSearch.trim()}”</Button> : null}</>} /></label>
        <label className="flow-wide">备注<Input.TextArea value={model.meta.expectedResult} onChange={event => patchMeta({ expectedResult: event.target.value })} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="测试目的、特殊说明、Bug 编号或其它备注" /></label>
      </div>
    </section>
    <section className="flow-section">
      <Title level={5}>发送配置</Title>
      <div className="flow-config-grid"><div><Text>用户标签（tagList）</Text><Select mode="tags" value={model.message.tagList || []} options={userTags.map(value => ({ value, label: value }))} onChange={setTagList} tokenSeparators={[',', '，', ';']} placeholder="输入后按 Enter 添加标签" /></div></div>
    </section>
    <section className="flow-section flow-editor-main">
      <Flex className="flow-message-title" justify="space-between" align="center"><Title level={5}>发送消息（input）</Title><Space><Text>JSON 模式</Text><Switch checked={jsonMode} onChange={setJsonModeEnabled} aria-label="JSON 模式" /></Space></Flex>
      {jsonMode ? <div className="json-flow-editor">
        {messageJsonError ? <Text type="danger" className="json-flow-error">{messageJsonError}</Text> : null}
        {messageJsonBlocks.map((block, index) => <React.Fragment key={index}>
          <div className="json-flow-block">
            <Button className="json-block-copy" size="small" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(block)}>复制 JSON</Button>
            <JsonCodeEditor value={block} onChange={event => updateJsonBlock(index, event.target.value)} onBlur={() => applyMessageJsonBlocks(messageJsonBlocks)} />
          </div>
          {index < messageJsonBlocks.length - 1 ? <div className="json-delay-divider">{jsonGroups[index]?.delaySeconds === null ? '请填写发送间隔' : `${jsonGroups[index]?.delaySeconds ?? 50}秒后发送下方消息`}</div> : null}
        </React.Fragment>)}
      </div> : <MessageFlowBuilder flow={flow} historyItems={historyItems} availableCases={cases} currentCaseId={model.id} onFlowAndHistoryChange={setFlowAndHistory} />}
    </section>
    <section className="flow-section flow-session">
      <Flex align="center" gap={8}><Title level={5}>会话属性</Title><Switch checked={sessionConfigEnabled} onChange={enabled => { setSessionConfigEnabled(enabled); patch({ session: { ...model.session, enabled } }); }} aria-label="配置会话属性" /></Flex>
      {sessionConfigEnabled ? <div className="flow-info-grid">{sessionFields.map(([field, label, type]) => <label key={field}>{label}（{field}）{type === 'datetime' ? <DatePicker showTime value={model.message[field] ? dayjs(model.message[field]) : null} onChange={(_, value) => patchMessage({ [field]: value || '' })} format="YYYY-MM-DD HH:mm:ss" placeholder="选择日期时间" /> : <Input value={model.message[field] || ''} onChange={event => patchMessage({ [field]: event.target.value })} />}</label>)}</div> : null}
    </section>
    <Modal open={previewOpen} title="消息预览" footer={null} onCancel={() => setPreviewOpen(false)} width={480} destroyOnHidden><div className="message-flow-modal"><MessageFlowPreview history={model.message.inputList || []} flow={flow} /></div></Modal>
  </section>;
}

let root;
window.renderCaseEditor = props => {
  const host = document.getElementById('caseEditorApp');
  if (!host) return;
  root ||= createRoot(host);
  root.render(<CaseEditor key={`${props.caseData.id}:${props.revision || 0}`} {...props} />);
  document.body.classList.add('visual-editor-ready');
};
document.dispatchEvent(new Event('case-editor-ui-ready'));
