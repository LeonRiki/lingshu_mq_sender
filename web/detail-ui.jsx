import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import './editor-ui.jsx';
import { Alert, Badge, Button, Checkbox, Collapse, ConfigProvider, DatePicker, Drawer, Dropdown, Flex, Input, Menu, message, Modal, Pagination, Popconfirm, Popover, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, TimePicker, Tooltip, Typography, Upload } from 'antd';
import { Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, applyNodeChanges, getBezierPath } from '@xyflow/react';
import {
  ApiOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  BookOutlined,
  BranchesOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  FlagOutlined,
  FullscreenOutlined,
  FunctionOutlined,
  GatewayOutlined,
  GroupOutlined,
  PartitionOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ThunderboltOutlined,
  UpOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
const { Title, Text } = Typography;
const listActionButtonTheme = { components: { Button: { iconGap: 4 } } };
const CASE_LIST_SELECTION_WIDTH = 32;
const CASE_LIST_TABLE_SCROLL_X = 1334;

message.config({ top: 72, maxCount: 3 });
window.showGlobalMessage = (content, type = 'success') => {
  const method = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  message[method]({ content, duration: method === 'error' ? 4 : 3 });
};
(window.pendingGlobalMessages || []).splice(0).forEach(({ content, type }) => window.showGlobalMessage(content, type));

function emit(type, detail = {}) {
  document.dispatchEvent(new CustomEvent('case-detail-action', { detail: { type, ...detail } }));
}

function emitListToolbar(type, detail = {}) {
  document.dispatchEvent(new CustomEvent('list-toolbar-action', { detail: { type, ...detail } }));
}

function emitDbConversationMessageAction(type) {
  document.dispatchEvent(new CustomEvent('db-conversation-message-action', { detail: { type } }));
}

function emitListToolbarChange(type, value) {
  document.dispatchEvent(new CustomEvent('list-toolbar-change', { detail: { type, value } }));
}

function displayDbConfigName(value) {
  return String(value || '').trim().replace(/\s{2,}/g, ' ') || '未配置数据库';
}

function SettingsMenuLabel({ name, deleteTitle, deleteDescription, deleteAriaLabel, onDelete }) {
  const stopMenuEvent = event => event?.stopPropagation?.();
  return <span className="settings-menu-label">
    <span className="settings-menu-name">{name}</span>
    <Popconfirm title={deleteTitle} description={deleteDescription} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete} onPopupClick={stopMenuEvent}>
      <Button type="text" danger size="small" shape="circle" className="settings-menu-delete" icon={<DeleteOutlined />} aria-label={deleteAriaLabel} onClick={stopMenuEvent} onMouseDown={stopMenuEvent} />
    </Popconfirm>
  </span>;
}

function RequiredFieldLabel({ children }) {
  return <span className="required-field-label"><b aria-hidden="true">*</b>{children}</span>;
}

function renderTriggerMessages(values) {
  const messages = Array.isArray(values) ? values : [];
  const visibleMessages = messages.slice(0, 3);
  const text = visibleMessages.length ? `${visibleMessages.map(value => `“${value}”`).join('；')}${messages.length > 3 ? '…' : ''}` : '-';
  const title = messages.length ? <>{messages.map((value, index) => <div key={`${value}-${index}`}>“{value}”</div>)}</> : '-';
  return <Tooltip title={title}><Text className="list-table-input">{text}</Text></Tooltip>;
}

function renderDbVariableValue(value) {
  if (value === null) return 'null';
  if (value === undefined || value === '') return '-';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const DB_NODE_TYPES = {
  lingxi_trigger: { name: '触发器', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', icon: ThunderboltOutlined },
  agent: { name: '智能体', color: '#2563eb', gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', icon: RobotOutlined },
  condition: { name: '条件分支', color: '#d97706', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', icon: BranchesOutlined },
  lingxi_send: { name: '发送消息', color: '#0891b2', gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)', icon: SendOutlined },
  code: { name: '代码脚本', color: '#059669', gradient: 'linear-gradient(135deg, #10b981, #059669)', icon: CodeOutlined },
  set_variable: { name: '变量设置', color: '#be185d', gradient: 'linear-gradient(135deg, #ec4899, #be185d)', icon: FunctionOutlined },
  knowledge_retrieval: { name: '知识检索', color: '#7c3aed', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', icon: BookOutlined },
  http_request: { name: 'HTTP 请求', color: '#0369a1', gradient: 'linear-gradient(135deg, #0284c7, #0369a1)', icon: ApiOutlined },
  output: { name: '流程结束', color: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)', icon: FlagOutlined },
  variable_aggregator: { name: '变量聚合', color: '#475569', gradient: 'linear-gradient(135deg, #64748b, #475569)', icon: GroupOutlined },
  intent_recognition: { name: '意图识别', color: '#9333ea', gradient: 'linear-gradient(135deg, #a855f7, #9333ea)', icon: PartitionOutlined },
  gateway: { name: '网关节点', color: '#0f766e', gradient: 'linear-gradient(135deg, #14b8a6, #0f766e)', icon: GatewayOutlined }
};

function dbNodeMeta(type) {
  return DB_NODE_TYPES[type] || { name: type || '未知节点', color: '#475569', gradient: 'linear-gradient(135deg, #64748b, #475569)', icon: BlockOutlined };
}

function compactText(value, length = 88) {
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

function dbNodeTypeOf(node, execution) {
  return execution?.nodeType || node.type || node.nodeType || node.data?.nodeType || '';
}

function dbConditionSummary(config, execution) {
  const branches = Array.isArray(config.branches) ? config.branches : [];
  const branchItems = branches.map(branch => ({
    id: String(branch.id || branch.label || ''),
    label: String(branch.label || branch.id || ''),
    isDefault: false
  })).filter(branch => branch.label);
  const defaultBranch = String(config.defaultBranch || '默认').trim();
  if (!branchItems.some(branch => branch.id === 'default' || branch.label === defaultBranch)) {
    branchItems.push({ id: 'default', label: defaultBranch, isDefault: true });
  }
  const output = execution?.previewOutputs && typeof execution.previewOutputs === 'object' ? execution.previewOutputs : {};
  const matched = [];
  const appendMatched = value => {
    if (value === null || value === undefined || value === '' || value === 'null') return;
    if (Array.isArray(value)) {
      value.forEach(appendMatched);
      return;
    }
    if (typeof value === 'object') {
      appendMatched(value.label || value.id || value.name);
      return;
    }
    const raw = String(value);
    const branch = branchItems.find(item => item.id === raw || item.label === raw);
    const label = raw === 'default' ? defaultBranch : branch?.label || raw;
    if (label && !matched.includes(label)) matched.push(label);
  };
  appendMatched(output.matchedBranchInfo);
  appendMatched(output.matchedBranches);
  appendMatched(output.matchedBranch);
  return { branches: branchItems, matched };
}

function dbNodeSummary(node) {
  const config = node.data?.config || {};
  const type = dbNodeTypeOf(node);
  if (type === 'agent') {
    return {
      primary: config.model || 'LLM Agent',
      preview: compactText(config.systemPrompt || config.userPrompt || config.outputSchema || '', 120)
    };
  }
  if (type === 'condition') {
    return { condition: dbConditionSummary(config, node.execution) };
  }
  if (type === 'code') {
    return { primary: config.language || '脚本', preview: compactText(config.code || '', 120) };
  }
  if (type === 'lingxi_send') {
    return { primary: node.execution?.previewLabel || '消息推送', preview: compactText(node.execution?.previewContent ?? '', 120) };
  }
  if (type === 'set_variable') {
    const assignments = Array.isArray(config.assignments) ? config.assignments : [];
    const variables = assignments.map(item => item.variableKey || item.key || item.name).filter(Boolean);
    if (!variables.length && config.variableKey) variables.push(config.variableKey);
    return { primary: `设置 ${variables.length} 个变量`, variables };
  }
  if (type === 'knowledge_retrieval') {
    return { primary: `TopK ${config.topK || 3}`, preview: compactText(config.query || (config.knowledgeBaseIds || []).join(' / ') || '知识库检索', 120) };
  }
  if (type === 'http_request') {
    return { primary: config.method || 'HTTP', preview: compactText(config.url || config.jsonBody || '', 120) };
  }
  if (type === 'lingxi_trigger') {
    return { preview: compactText(node.execution?.previewContent || '', 120) };
  }
  if (type === 'output') {
    return { preview: compactText(config.outputMapping || config.content || node.data?.label || '', 120) };
  }
  return { primary: type || node.id, preview: compactText(node.data?.description || node.data?.label || node.id, 120) };
}

function isDbExecutionSuccess(status) {
  return ['SUCCESS', 'COMPLETED'].includes(String(status || '').toUpperCase());
}

function isDbExecutionFailure(status) {
  return ['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED', 'TIMEOUT', 'ABORTED'].includes(String(status || '').toUpperCase());
}

const DB_CONVERSATION_POLL_INTERVAL_MS = 3000;
const DB_CONVERSATION_POLL_TIMEOUT_MS = 60000;

function dbEdgeLabel(edge, nodeById) {
  const handle = String(edge.label || edge.sourceHandle || '').trim();
  if (!handle || handle === 'out' || handle === 'in') return '';
  const sourceNode = nodeById.get(edge.source);
  const branches = Array.isArray(sourceNode?.data?.config?.branches) ? sourceNode.data.config.branches : [];
  const branch = branches.find(item => String(item.id || '') === handle || String(item.label || '') === handle);
  if (branch?.label) return branch.label;
  if (handle === 'default') return '默认';
  return handle;
}

const DbWorkflowNode = memo(function DbWorkflowNode({ id, data }) {
  const execution = data.execution;
  const nodeType = data.nodeType || '';
  const meta = dbNodeMeta(nodeType);
  const Icon = meta.icon;
  const status = data.status || 'idle';
  const summary = data.summary || {};
  const condition = summary.condition;
  return <div className={`db-workflow-card ${status}${data.activeStep ? ' active-step' : ''}${data.legacyState ? ` historical ${data.legacyState}` : ''}`} style={{ '--node-accent': meta.color }}>
    <Handle className="db-workflow-handle in" type="target" position={Position.Left} />
    {execution ? <span className="db-workflow-step">{execution.durationMs || 0} ms</span> : null}
    <div className="db-workflow-card-header">
      <span className="db-workflow-icon" style={{ background: meta.gradient }}><Icon /></span>
      <span className="db-workflow-title" title={data.label || id}>{data.label || id}</span>
      {data.legacyState ? <span className={`db-workflow-history-tag ${data.legacyState}`}>{data.legacyState === 'modified' ? '已修改' : '已删除'}</span> : null}
    </div>
    <div className="db-workflow-body">
      {condition ? <>
        <div className="db-workflow-branches">
          {condition.branches.map(branch => {
            const matched = condition.matched.includes(branch.label) || condition.matched.includes(branch.id);
            return <div key={`${branch.id}:${branch.label}`} className={`db-workflow-branch${matched ? ' matched' : ''}`} title={branch.label}>
              <span className="db-workflow-branch-label">{branch.label}</span>
              {matched ? <span className="db-workflow-branch-hit">命中</span> : null}
            </div>;
          })}
        </div>
      </> : <>
        {summary.primary ? <div className="db-workflow-primary" title={summary.primary}>{summary.primary}</div> : null}
        {summary.preview ? <div className="db-workflow-preview" title={summary.preview}>{summary.preview}</div> : null}
        {summary.variables?.length ? <div className="db-workflow-variables">{summary.variables.map(variable => <div key={variable} className="db-workflow-variable" title={variable}>{variable}</div>)}</div> : null}
        {summary.chips?.length ? <div className="db-workflow-chips">{summary.chips.map(chip => <span key={chip}>{chip}</span>)}</div> : null}
      </>}
    </div>
    <Handle className="db-workflow-handle out" type="source" position={Position.Right} />
  </div>;
});

const dbWorkflowNodeTypes = { dbWorkflow: DbWorkflowNode };

function DbWorkflowEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style, className, label, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const labelOffset = Number(data?.labelOffset || 0);
  return <>
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} className={className} />
    {label ? <EdgeLabelRenderer>
      <div
        className={`db-flow-edge-label${data?.active ? ' active' : ''}${data?.historical ? ' historical' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffset}px)` }}
      >{label}</div>
    </EdgeLabelRenderer> : null}
  </>;
}

const dbWorkflowEdgeTypes = { dbWorkflowEdge: DbWorkflowEdge };

function CaseListToolbar({ data }) {
  return (
    <Flex className="list-page-toolbar" align="center" gap={12}>
      <Space size={8}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => emitListToolbar('new-case')}>新增用例</Button>
        <Dropdown trigger={['hover']} popupRender={() => <Flex className="case-import-menu" vertical gap={0}><Upload accept=".json,application/json" showUploadList={false} beforeUpload={file => { emitListToolbar('import-case', { file, format: 'json' }); return false; }}><Button type="text" block>导入 JSON</Button></Upload><Upload accept=".csv,text/csv" showUploadList={false} beforeUpload={file => { emitListToolbar('import-case', { file, format: 'csv' }); return false; }}><Button type="text" block>导入 CSV</Button></Upload></Flex>}><Button>导入测试用例</Button></Dropdown>
        <Button onClick={() => emitListToolbar('export-cases')}>导出测试用例</Button>
        <Text type="secondary">共 {data.allCount} 条</Text>
      </Space>
      <Space className="list-page-filters" size={8}>
        <Select aria-label="按业务场景筛选" value={data.scenario} onChange={value => emitListToolbarChange('case-scenario', value)} options={[{ value: '', label: '全部业务场景' }, ...data.scenarios.map(value => ({ value, label: value }))]} style={{ width: 180 }} />
        <Select aria-label="按标签筛选" mode="multiple" allowClear value={data.tagFilters} onChange={values => emitListToolbarChange('case-tags', values)} options={data.tags.map(value => ({ value, label: value }))} placeholder="筛选标签" style={{ width: 220 }} />
        <Input value={data.search} onChange={event => emitListToolbarChange('case-search', event.target.value)} placeholder="搜索测试场景名称 / 触发消息" style={{ width: 300 }} />
      </Space>
    </Flex>
  );
}

function RecordListToolbar({ data }) {
  const filters = [
    { key: 'record-trigger-message', label: '触发消息', value: data.triggerMessage },
    { key: 'record-wework-corp-id', label: '企微账号 ID', value: data.weworkCorpId },
    { key: 'record-friend-nick', label: '好友昵称', value: data.friendNick }
  ].filter(filter => filter.value);
  const filterContent = <Flex vertical gap={12} style={{ width: 280 }}>
    <Input allowClear value={data.triggerMessage} onChange={event => emitListToolbarChange('record-trigger-message', event.target.value)} placeholder="触发消息" style={{ height: 32 }} />
    <Input allowClear value={data.weworkCorpId} onChange={event => emitListToolbarChange('record-wework-corp-id', event.target.value)} placeholder="企微账号 ID（weworkCorpId）" style={{ height: 32 }} />
    <Input allowClear value={data.friendNick} onChange={event => emitListToolbarChange('record-friend-nick', event.target.value)} placeholder="好友昵称" style={{ height: 32 }} />
    <Flex justify="flex-end"><Button type="link" disabled={!filters.length} onClick={() => emitListToolbarChange('record-clear-advanced-filters')}>清空筛选</Button></Flex>
  </Flex>;
  return <Flex vertical gap={8} style={{ width: '100%' }}>
    <Flex className="list-page-toolbar" align="center" gap={12} wrap>
      <Button icon={<ReloadOutlined />} onClick={() => emitListToolbar('refresh-records')}>刷新</Button>
      <Space className="list-page-filters" size={8}>
        <Input allowClear value={data.search} onChange={event => emitListToolbarChange('record-search', event.target.value)} placeholder="搜索消息内容、企微账号 ID、好友昵称、Conversation ID、场景、Agent ID" style={{ width: 440, height: 32 }} />
        <Popover trigger="click" title="精确筛选" content={filterContent}><Badge count={filters.length} size="small"><Button type="text" icon={<FilterOutlined />} aria-label="精确筛选" /></Badge></Popover>
      </Space>
    </Flex>
    {filters.length ? <Space size={[4, 4]} wrap>{filters.map(filter => <Tag key={filter.key} closable onClose={() => emitListToolbarChange(filter.key, '')}>{`${filter.label}：${filter.value}`}</Tag>)}</Space> : null}
  </Flex>;
}

function CaseListPage({ data }) {
  if (data.loading) return <div className="ant-list-page list-page-loading"><Spin description="正在加载测试用例" /></div>;
  const bulkHeaderActive = data.selected > 0;
  const bulkHeader = <Flex className="list-bulk-header" justify="space-between" align="center">
    <Text>{data.selected} selected</Text>
    <Space size={8}>
      <Button onClick={() => emitListToolbar('batch-edit')}>批量修改</Button>
      <Button onClick={() => emitListToolbar('batch-send')}>批量发送</Button>
      <Button danger onClick={() => emitListToolbar('delete-selected-cases')}>批量删除</Button>
    </Space>
  </Flex>;
  const columns = [
    {
      title: '测试场景名称',
      dataIndex: 'name',
      width: 360,
      sorter: true,
      sortOrder: data.sort?.field === 'name' ? data.sort.order : null,
      render: (_, record) => <div className={`case-name-cell ${record.note ? '' : 'no-note'}`}><Button type="link" className="table-title case-name-link" onClick={event => { event.stopPropagation(); emitListToolbar('open-case', { id: record.id }); }}>{record.name}</Button>{record.note ? <Text type="secondary" className="list-table-note">{record.note}</Text> : null}</div>
    },
    { title: '业务场景', dataIndex: 'businessScenario', width: 132, render: value => value ? <Tag color="green" variant="outlined">{value}</Tag> : <Text type="secondary">-</Text> },
    { title: '触发消息', dataIndex: 'input', width: 210, ellipsis: true, render: renderTriggerMessages },
    { title: 'TagList', dataIndex: 'tags', width: 128, render: tags => { const values = Array.isArray(tags) ? tags : []; const title = values.join('、'); return values.length ? <Tooltip title={title}><div className="list-table-tags">{values.map(value => <Tag key={value} color="blue" variant="outlined">{value}</Tag>)}</div></Tooltip> : <Text type="secondary">-</Text>; } },
    { title: '请求次数', dataIndex: 'batchCount', width: 76, align: 'center', render: value => value },
    { title: '创建日期', dataIndex: 'createdAt', width: 112, sorter: true, sortOrder: data.sort?.field === 'createdAt' ? data.sort.order : null },
    { title: '更新时间', dataIndex: 'updatedAt', width: 112, sorter: true, sortOrder: data.sort?.field === 'updatedAt' ? data.sort.order : null },
    { title: '操作', key: 'actions', width: 172, onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }), onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_, record) => <ConfigProvider theme={listActionButtonTheme}><Space size={4}><Button type="link" size="small" icon={<EditOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('open-case', { id: record.id }); }}>编辑</Button><Button type="link" size="small" icon={<CopyOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('duplicate-case', { id: record.id }); }}>复制</Button><Button type="link" size="small" icon={<SendOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('send-case', { id: record.id }); }}>发送</Button><Popconfirm title="确定删除该测试用例吗？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => emitListToolbar('delete-case', { id: record.id, confirmed: true })}><Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={event => event.stopPropagation()}>删除</Button></Popconfirm></Space></ConfigProvider> }
  ];
  const tableColumns = bulkHeaderActive
    ? columns.map((column, index) => {
      const { sorter, sortOrder, ...plainColumn } = column;
      return index === 0
        ? { ...plainColumn, title: bulkHeader, onHeaderCell: () => ({ colSpan: columns.length }) }
        : { ...plainColumn, title: null, onHeaderCell: () => ({ colSpan: 0 }) };
    })
    : columns;
  return <div className="ant-list-page">
    <CaseListToolbar data={data} />
    <Table className="ant-list-table case-list-table" size="middle" rowKey="id" columns={tableColumns} dataSource={data.items} tableLayout="fixed" showSorterTooltip={{ target: 'sorter-icon' }} scroll={{ x: CASE_LIST_TABLE_SCROLL_X, y: 'calc(100vh - 224px)' }} onChange={(_, __, sorter, extra) => { if (extra.action === 'sort') emitListToolbar('set-case-sort', { field: sorter.field, order: sorter.order }); }} rowSelection={{ columnWidth: CASE_LIST_SELECTION_WIDTH, selectedRowKeys: data.selectedIds, onChange: keys => emitListToolbar('set-case-selection', { ids: keys, pageIds: data.items.map(item => item.id) }) }} pagination={{ current: data.pageNo, pageSize: data.pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [15, 20, 50, 100], showTotal: total => `共 ${total} 条`, onChange: (pageNo, pageSize) => emitListToolbar('set-case-page', { pageNo, pageSize }) }} />
  </div>;
}

function RecordListPage({ data }) {
  const columns = [
    {
      title: 'Conversation_id',
      dataIndex: 'conversationId',
      width: 210,
      ellipsis: true,
      render: value => value ? <Flex align="center" gap={4} style={{ minWidth: 0 }}><Text className="list-table-input" ellipsis={{ tooltip: value }} style={{ minWidth: 0, flex: 1 }}>{value}</Text><Tooltip title="复制 Conversation_id"><Button type="link" size="small" shape="circle" icon={<CopyOutlined />} aria-label="复制 Conversation_id" onClick={event => { event.stopPropagation(); emitListToolbar('copy-conversation-id', { value }); }} /></Tooltip></Flex> : <Text type="secondary">-</Text>
    },
    { title: 'Agent ID', dataIndex: 'agentId', width: 104 },
    { title: '测试场景名称', dataIndex: 'caseName', width: 180, render: (_, record) => <div className={`case-name-cell ${record.note ? '' : 'no-note'}`}><div className="table-title">{record.caseName}</div>{record.note ? <Text type="secondary" className="list-table-note">{record.note}</Text> : null}</div> },
    { title: '触发消息', dataIndex: 'triggerMessages', ellipsis: true, render: renderTriggerMessages },
    { title: '请求次数', dataIndex: 'mqMessageCount', width: 88 },
    { title: '用户消息数', dataIndex: 'userMessageCount', width: 100 },
    { title: '状态', dataIndex: 'status', width: 88, render: value => <Tag color="blue" variant="outlined">{value}</Tag> },
    { title: '执行时间', dataIndex: 'executedAt', width: 168 },
    { title: '操作', key: 'actions', width: 90, render: (_, record) => <ConfigProvider theme={listActionButtonTheme}><Button type="link" size="small" icon={<EyeOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('open-record', { date: record.date, fileName: record.fileName }); }}>查看</Button></ConfigProvider> }
  ];
  return <div className="ant-list-page">
    <RecordListToolbar data={data} />
    <Table className="ant-list-table" size="middle" rowKey="id" columns={columns} dataSource={data.items} tableLayout="fixed" scroll={{ y: 'calc(100vh - 224px)' }} pagination={{ current: data.pageNo, pageSize: data.pageSize, total: data.total, showSizeChanger: false, onChange: pageNo => emitListToolbar('set-record-page', { pageNo }) }} />
  </div>;
}

function DbSettingsPanel({ data }) {
  const configs = data.dbConfigs || [];
  const selectedId = data.dbSelectedId || configs[0]?.id || '__new__';
  const selected = selectedId === '__new__' ? null : configs.find(config => config.id === selectedId);
  const emptyForm = { name: '', host: '', port: 5432, database: '', user: '', password: '', environment: '' };
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    setForm(selected ? { ...selected, password: '' } : emptyForm);
  }, [selectedId, data.open]);
  const setField = key => event => setForm(current => ({ ...current, [key]: event?.target ? event.target.value : event }));
  const menuItems = [...configs.map(config => ({
    key: config.id,
    label: <SettingsMenuLabel
      name={config.name || '未命名数据库'}
      deleteTitle={`删除数据库配置“${config.name || '未命名数据库'}”？`}
      deleteDescription="删除后将无法恢复，若当前正在使用该配置会同时断开连接。"
      deleteAriaLabel={`删除数据库配置 ${config.name || '未命名数据库'}`}
      onDelete={() => emitListToolbar('delete-db-config', { configId: config.id })}
    />
  })), { type: 'divider' }, { key: '__new__', icon: <PlusOutlined />, label: '新增数据库配置' }];
  const complete = form.host && form.port && form.database && form.user && form.environment && (form.password || selected?.hasPassword);
  return <Flex className="mq-settings-layout" gap={16}>
      <aside className="mq-settings-nav"><Menu mode="inline" selectedKeys={[selectedId]} items={menuItems} onClick={({ key }) => emitListToolbar('select-db-config', { value: key })} /></aside>
    <section className="mq-settings-form">
      <Flex justify="space-between" align="center">
        <Title level={5} style={{ margin: 0 }}>{selectedId === '__new__' ? '新增数据库配置' : '数据库配置'}</Title>
        <Space>
          <Button disabled={!selected?.id} loading={data.dbTesting} onClick={() => emitListToolbar('test-db-config', { configId: selected.id })}>测试连接</Button>
          <Button type="primary" disabled={!complete} onClick={() => emitListToolbar('save-db-config', { config: { ...form, id: selectedId === '__new__' ? undefined : selectedId } })}>保存配置</Button>
        </Space>
      </Flex>
      <div className="mq-config-grid">
        <label>配置名称<Input value={form.name} onChange={setField('name')} /></label>
        <label><RequiredFieldLabel>Host</RequiredFieldLabel><Input value={form.host} onChange={setField('host')} /></label>
        <label><RequiredFieldLabel>Port</RequiredFieldLabel><Input value={form.port} onChange={setField('port')} /></label>
        <label><RequiredFieldLabel>Database</RequiredFieldLabel><Input value={form.database} onChange={setField('database')} /></label>
        <label><RequiredFieldLabel>User</RequiredFieldLabel><Input value={form.user} onChange={setField('user')} /></label>
        <label><RequiredFieldLabel>Password</RequiredFieldLabel><Input.Password value={form.password} onChange={setField('password')} placeholder={selected?.hasPassword ? '已配置，留空不修改' : ''} /></label>
        <label className="db-environment-field"><RequiredFieldLabel>数据库环境</RequiredFieldLabel>
          <Radio.Group className="db-environment-options" value={form.environment} onChange={setField('environment')}>
            <Radio value="production">线上环境</Radio>
            <Radio value="test">测试环境</Radio>
          </Radio.Group>
        </label>
      </div>
    </section>
  </Flex>;
}

function DbDateTimeRangePicker({
  startTime,
  endTime,
  maxDays = 7,
  onChange,
  className = ''
}) {
  const presets = useMemo(() => {
    const list = [
      { key: 'today', label: '今天', getRange: () => [dayjs().startOf('day'), dayjs().endOf('day')] },
      { key: 'yesterday', label: '昨天', getRange: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
      { key: '24h', label: '近 24 小时', getRange: () => [dayjs().subtract(24, 'hour'), dayjs()] },
      { key: '3d', label: '近 3 天', getRange: () => [dayjs().subtract(2, 'day').startOf('day'), dayjs().endOf('day')] },
      { key: '7d', label: '近 7 天', getRange: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] }
    ];
    if (maxDays >= 15) {
      list.push({ key: '15d', label: '近 15 天', getRange: () => [dayjs().subtract(14, 'day').startOf('day'), dayjs().endOf('day')] });
    }
    return list;
  }, [maxDays]);

  const dateValue = useMemo(() => {
    if (!startTime && !endTime) return null;
    return [
      startTime ? dayjs(startTime) : null,
      endTime ? dayjs(endTime) : null
    ];
  }, [startTime, endTime]);

  const timeValue = useMemo(() => {
    if (!startTime && !endTime) return [dayjs('00:00:00', 'HH:mm:ss'), dayjs('23:59:59', 'HH:mm:ss')];
    return [
      startTime ? dayjs(startTime) : dayjs('00:00:00', 'HH:mm:ss'),
      endTime ? dayjs(endTime) : dayjs('23:59:59', 'HH:mm:ss')
    ];
  }, [startTime, endTime]);

  const activePresetKey = useMemo(() => {
    if (!startTime || !endTime) return '';
    const s = dayjs(startTime);
    const e = dayjs(endTime);
    for (const preset of presets) {
      const [pStart, pEnd] = preset.getRange();
      if (preset.key === '24h') {
        if (Math.abs(e.diff(pEnd, 'second')) <= 120 && Math.abs(s.diff(pStart, 'second')) <= 120) {
          return preset.key;
        }
      } else {
        if (s.format('YYYY-MM-DD HH:mm:ss') === pStart.format('YYYY-MM-DD HH:mm:ss') &&
            e.format('YYYY-MM-DD HH:mm:ss') === pEnd.format('YYYY-MM-DD HH:mm:ss')) {
          return preset.key;
        }
      }
    }
    return '';
  }, [startTime, endTime, presets]);

  const handlePresetChange = e => {
    const key = e.target.value;
    const target = presets.find(item => item.key === key);
    if (!target) return;
    const [pStart, pEnd] = target.getRange();
    onChange?.([pStart.format('YYYY-MM-DD HH:mm:ss'), pEnd.format('YYYY-MM-DD HH:mm:ss')]);
  };

  const handleDateChange = dates => {
    if (!dates || !dates[0] || !dates[1]) {
      onChange?.(['', '']);
      return;
    }
    let start = dates[0];
    let end = dates[1];
    if (end.isBefore(start)) {
      [start, end] = [end, start];
    }
    const diffDays = (end.startOf('day').valueOf() - start.startOf('day').valueOf()) / 86400000;
    if (diffDays >= maxDays) {
      const prevStart = dateValue?.[0];
      const changedStart = !prevStart || !start.isSame(prevStart, 'day');
      if (changedStart) {
        end = start.add(maxDays - 1, 'day');
        window.showGlobalMessage?.(`查询跨度最长为 ${maxDays} 天，已自动为您同步结束日期`, 'info');
      } else {
        start = end.subtract(maxDays - 1, 'day');
        window.showGlobalMessage?.(`查询跨度最长为 ${maxDays} 天，已自动为您同步开始日期`, 'info');
      }
    }
    const tStart = timeValue?.[0] ? timeValue[0].format('HH:mm:ss') : '00:00:00';
    const tEnd = timeValue?.[1] ? timeValue[1].format('HH:mm:ss') : '23:59:59';
    onChange?.([`${start.format('YYYY-MM-DD')} ${tStart}`, `${end.format('YYYY-MM-DD')} ${tEnd}`]);
  };

  const handleTimeChange = times => {
    if (!times || !times[0] || !times[1]) return;
    const dStart = dateValue?.[0] ? dateValue[0].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const dEnd = dateValue?.[1] ? dateValue[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    onChange?.([`${dStart} ${times[0].format('HH:mm:ss')}`, `${dEnd} ${times[1].format('HH:mm:ss')}`]);
  };

  return <div className={`db-datetime-range-selector ${className}`.trim()}>
    <Radio.Group
      className="db-datetime-presets"
      size="small"
      optionType="button"
      buttonStyle="solid"
      value={activePresetKey}
      onChange={handlePresetChange}
      options={presets.map(item => ({ label: item.label, value: item.key }))}
    />
    <div className="db-datetime-inputs">
      <DatePicker.RangePicker
        className="db-datetime-date-picker"
        value={dateValue}
        format="YYYY-MM-DD"
        allowClear={false}
        onChange={handleDateChange}
      />
      <TimePicker.RangePicker
        className="db-datetime-time-picker"
        value={timeValue}
        format="HH:mm:ss"
        needConfirm={false}
        allowClear={false}
        onChange={handleTimeChange}
      />
    </div>
  </div>;
}

function DbConversationListPage({ data }) {
  const filters = data.filters || {};
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [tableScrollY, setTableScrollY] = useState(240);
  const pageRef = useRef(null);
  const toolbarRef = useRef(null);
  const listHeaderRef = useRef(null);
  const tableAreaRef = useRef(null);
  useEffect(() => {
    const syncTableHeight = () => {
      const page = pageRef.current;
      const toolbar = toolbarRef.current;
      const listHeader = listHeaderRef.current;
      const tableArea = tableAreaRef.current;
      const pagination = tableArea?.querySelector('.db-record-pagination');
      const tableHeader = tableArea?.querySelector('.ant-table-header');
      if (tableArea && pagination && tableHeader) {
        setTableScrollY(Math.max(120, Math.floor(tableArea.clientHeight - pagination.offsetHeight - tableHeader.offsetHeight)));
        return;
      }
      if (!page || !toolbar || !listHeader) return;
      const pageGap = 28;
      const paginationHeight = 54;
      setTableScrollY(Math.max(120, Math.floor(page.clientHeight - toolbar.offsetHeight - listHeader.offsetHeight - pageGap - paginationHeight)));
    };
    const observer = new ResizeObserver(syncTableHeight);
    [pageRef.current, toolbarRef.current, listHeaderRef.current, tableAreaRef.current, tableAreaRef.current?.querySelector('.db-record-pagination'), tableAreaRef.current?.querySelector('.ant-table-header')].filter(Boolean).forEach(element => observer.observe(element));
    syncTableHeight();
    return () => observer.disconnect();
  }, [data.queried, data.loading, data.items?.length]);
  useEffect(() => {
    const tableBody = tableAreaRef.current?.querySelector('.ant-table-body');
    if (!tableBody) return;
    const maxScrollTop = Math.max(0, tableBody.scrollHeight - tableBody.clientHeight);
    tableBody.scrollTop = Math.min(Math.max(0, Number(data.listScrollTop) || 0), maxScrollTop);
  }, [data.listScrollTop, data.loading, data.pageNo, data.items]);
  const renderDbMessageText = value => value === null ? 'null' : String(value || '-');
  const queryReady = Boolean(String(filters.workflowId || '').trim() && filters.startTime && filters.endTime);
  const renderMessageSummary = (values, record) => {
    const messages = Array.isArray(values) ? values : [];
    const summaryLines = messages
      .map(renderDbMessageText)
      .map(value => value.replace(/\s*[\r\n]+\s*/g, ' ').trim())
      .filter(value => value && value !== '-');
    const visibleLines = summaryLines.slice(0, 2);
    return <span className="list-table-input db-message-summary">
      {visibleLines.length ? visibleLines.map((line, index) => <span key={`${index}-${line}`} className="db-message-summary-line">{line}</span>) : <span className="db-message-summary-line">-</span>}
      <span className="db-message-summary-footer"><span className="db-message-summary-count">共 {summaryLines.length} 条</span><Button className="db-message-summary-preview-button" type="link" size="small" onClick={() => emitListToolbar('open-db-conversation-preview', { workflowId: record.workflowId, conversationId: record.conversationId })}>查看</Button></span>
    </span>;
  };
  const columns = [
    { title: '工作流ID', dataIndex: 'workflowId', width: 120, fixed: 'left', render: value => <Text strong>{value}</Text> },
    { title: '学员昵称', dataIndex: 'friendNick', width: 140, ellipsis: true, render: value => <Text className="list-table-input" ellipsis={{ tooltip: value || '-' }}>{value || '-'}</Text> },
    { title: 'Conversation ID', dataIndex: 'conversationId', width: 260, fixed: 'left', ellipsis: true, render: value => <Text className="list-table-input" ellipsis={{ tooltip: value }}>{value}</Text> },
    { title: '消息摘要', dataIndex: 'messageSummary', render: renderMessageSummary },
    { title: '状态', dataIndex: 'hasError', width: 120, render: (_, record) => record.hasError ? <Tooltip title={record.errorSummary}><Tag color="red">有错误</Tag></Tooltip> : <Tag color="green">正常</Tag> },
    { title: '消息数', dataIndex: 'messageCount', width: 84, align: 'center' },
    { title: '最近消息时间', dataIndex: 'lastMessageAt', width: 190, render: value => <Text>{value || '-'}</Text> },
    { title: '操作', key: 'actions', width: 184, render: (_, record) => <Space size={0}><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => emitListToolbar('open-db-conversation', { workflowId: record.workflowId, conversationId: record.conversationId, listScrollTop: tableAreaRef.current?.querySelector('.ant-table-body')?.scrollTop || 0 })}>查看详情</Button><Button type="link" size="small" onClick={() => emitListToolbar('open-db-conversation-variables', { workflowId: record.workflowId, conversationId: record.conversationId })}>查看变量</Button></Space> }
  ];
  const saveCurrentFilter = () => {
    const name = filterName.trim();
    if (!name) {
      message.warning('请输入筛选条件名称');
      return;
    }
    emitListToolbar('save-db-filter', { name });
    setFilterName('');
    setSaveFilterOpen(false);
  };
  const connection = data.connection || {};
  const connectionStatus = connection.status || 'disconnected';
  const connectionMeta = connectionStatus === 'connected'
    ? { badge: 'success', label: '已连接', title: '数据库已连接' }
    : connectionStatus === 'error'
      ? { badge: 'error', label: '连接异常', title: connection.errorMessage || '数据库连接异常' }
      : { badge: 'default', label: '未连接', title: '数据库未连接' };
  const connectionConfigItems = (data.configs || []).map(config => ({
    key: config.id,
    label: (() => {
      const isCurrent = config.id === connection.configId;
      const status = isCurrent ? connectionStatus : 'disconnected';
      const statusMeta = status === 'connected'
        ? { badge: 'success', label: '已连接', className: 'connected' }
        : status === 'error'
          ? { badge: 'error', label: '连接异常', className: 'error' }
          : { badge: 'default', label: '未连接', className: 'disconnected' };
      return <span className="db-connection-dropdown-item">
        <span className="db-connection-dropdown-main"><Badge status={statusMeta.badge} /><span className="db-connection-dropdown-name">{displayDbConfigName(config.name)}<small>PostgreSQL - {config.host || '未设置 Host'}</small></span></span>
        <Tag className={`db-connection-dropdown-status ${statusMeta.className}`} bordered={false}>{statusMeta.label}</Tag>
      </span>;
    })(),
    disabled: data.connectionChanging
  }));
  return <div className="db-record-page" ref={pageRef}>
    <div className="db-record-toolbar" ref={toolbarRef}>
      <div className="db-filter-grid">
        <div className="db-filter-row db-filter-row-primary">
          <div className="db-filter-field db-filter-field-workflow"><span><b>*</b>工作流</span><Select className="db-filter-control" allowClear showSearch optionFilterProp="label" value={filters.workflowId || undefined} loading={data.workflowsLoading || data.connectionChanging} onOpenChange={open => open && emitListToolbar('ensure-db-workflows')} onChange={value => emitListToolbarChange('db-workflow-id', value || '')} options={(data.workflows || []).map(workflow => ({ value: workflow.id, label: `${workflow.id}-${workflow.name}` }))} placeholder="请选择工作流" /></div>
          <div className="db-filter-field db-filter-field-time"><span><b>*</b>学员消息时间</span><DbDateTimeRangePicker className="db-filter-control" maxDays={7} startTime={filters.startTime} endTime={filters.endTime} onChange={values => emitListToolbarChange('db-time-range', values)} /></div>
        </div>
        <div className="db-filter-row db-filter-row-secondary">
          <div className="db-filter-field"><span>学员昵称</span><Input className="db-filter-control" allowClear value={filters.friendNick} onChange={event => emitListToolbarChange('db-friend-nick', event.target.value)} placeholder="请输入学员昵称（支持模糊匹配）" /></div>
          <div className="db-filter-field"><span>Conversation ID</span><Input className="db-filter-control" allowClear value={filters.conversationId} onChange={event => emitListToolbarChange('db-conversation-id', event.target.value)} placeholder="请输入Conversation ID" /></div>
          <div className="db-filter-field"><span>消息摘要</span><Input className="db-filter-control" allowClear value={filters.keyword} onChange={event => emitListToolbarChange('db-keyword', event.target.value)} placeholder="请输入消息摘要关键词" /></div>
          <div className="db-filter-field"><span>状态</span><Select className="db-filter-control" value={filters.hasError} onChange={value => emitListToolbarChange('db-has-error', value)} options={[{ value: '', label: '全部状态' }, { value: 'true', label: '有错误节点' }, { value: 'false', label: '无错误节点' }]} /></div>
        </div>
      </div>
      <div className="db-filter-actions">
        <div className="db-saved-filter-row">
          {data.savedFilters?.map(filter => <span key={filter.id} className="db-saved-filter">
            <Button type="text" size="small" onClick={() => emitListToolbar('apply-db-filter', { filters: filter.filters })}>{filter.name}</Button>
            <Popconfirm title={`删除筛选条件“${filter.name}”？`} okText="删除" cancelText="取消" onConfirm={() => emitListToolbar('delete-db-filter', { id: filter.id })}><Button type="text" size="small" danger shape="circle" icon={<DeleteOutlined />} aria-label={`删除筛选条件 ${filter.name}`} /></Popconfirm>
          </span>)}
        </div>
        <Space size={8}>
          <Button icon={<SaveOutlined />} disabled={!String(filters.workflowId || '').trim()} onClick={() => setSaveFilterOpen(true)}>保存筛选</Button>
          <Button icon={<ReloadOutlined />} onClick={() => emitListToolbar('reset-db-conversations')}>重置</Button>
          <Button type="primary" icon={<DatabaseOutlined />} disabled={!queryReady} onClick={() => emitListToolbar('query-db-conversations')}>查询</Button>
        </Space>
      </div>
    </div>
    <div className="db-record-list-header" ref={listHeaderRef}><div className="db-record-list-heading"><span className="db-record-list-title">数据列表</span>{data.queried ? <span className="db-record-total">共 {data.total || 0} 条</span> : null}</div><Space size={8}><Dropdown menu={{ items: connectionConfigItems, selectedKeys: connection.configId ? [connection.configId] : [], onClick: ({ key }) => emitListToolbar('switch-db-config', { configId: key }) }} popupRender={menus => <div className="db-connection-dropdown"><div className="db-connection-dropdown-title">当前数据库配置</div>{menus}<div className="db-connection-dropdown-actions"><Button type="text" danger icon={<DisconnectOutlined />} disabled={connectionStatus !== 'connected' || data.connectionChanging} onClick={() => emitListToolbar('disconnect-db')}>断开当前连接</Button></div></div>} trigger={['click']} disabled={!connectionConfigItems.length || data.connectionChanging}><Tooltip title={connectionMeta.title}><Button className="db-connection-status-trigger" loading={data.connectionChanging} aria-label="数据库连接状态"><Badge status={connectionMeta.badge} /><span>{displayDbConfigName(connection.name)}（{connectionMeta.label}）</span><DownOutlined /></Button></Tooltip></Dropdown><Tooltip title="按当前筛选条件刷新"><Button icon={<ReloadOutlined />} aria-label="刷新数据" onClick={() => emitListToolbar('refresh-db-conversations')}>刷新数据</Button></Tooltip></Space></div>
    {!data.queried && !data.loading ? <div className="db-record-empty"><Text type="secondary">请设置筛选条件后点击查询</Text></div> : <div className="db-record-table-area" ref={tableAreaRef}><Table className="ant-list-table db-record-table" size="middle" rowKey="id" columns={columns} dataSource={data.items || []} loading={data.loading} tableLayout="fixed" scroll={{ y: tableScrollY, x: 1260 }} pagination={false} /><Pagination className="db-record-pagination" current={data.pageNo} pageSize={data.pageSize} total={data.total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`} onChange={(pageNo, pageSize) => emitListToolbar('set-db-page', { pageNo, pageSize })} /></div>}
    <DbConversationPreviewDrawer detail={data.conversationPreview} loading={data.conversationPreviewLoading} workflowId={data.conversationPreviewWorkflowId} conversationId={data.conversationPreviewConversationId} onClose={() => emitListToolbar('close-db-conversation-preview')} onOpenDetail={() => emitListToolbar('open-db-conversation', { workflowId: data.conversationPreviewWorkflowId, conversationId: data.conversationPreviewConversationId, listScrollTop: tableAreaRef.current?.querySelector('.ant-table-body')?.scrollTop || 0 })} />
    <Modal open={saveFilterOpen} title="保存筛选条件" okText="保存" cancelText="取消" onCancel={() => { setSaveFilterOpen(false); setFilterName(''); }} onOk={saveCurrentFilter} destroyOnHidden>
      <Input autoFocus value={filterName} onChange={event => setFilterName(event.target.value)} onPressEnter={saveCurrentFilter} placeholder="请输入筛选条件名称" maxLength={40} />
    </Modal>
  </div>;
}

function renderJsonTokens(json) {
  const tokenPattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(json))) {
    if (match.index > lastIndex) tokens.push(json.slice(lastIndex, match.index));
    const token = match[0];
    let className = 'json-token-punctuation';
    if (token.startsWith('"')) {
      className = json.slice(tokenPattern.lastIndex).trimStart().startsWith(':') ? 'json-token-key' : 'json-token-string';
    } else if (/^-?\d/.test(token)) className = 'json-token-number';
    else if (token === 'true' || token === 'false') className = 'json-token-boolean';
    else if (token === 'null') className = 'json-token-null';
    tokens.push(<span key={`${match.index}-${token}`} className={className}>{token}</span>);
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < json.length) tokens.push(json.slice(lastIndex));
  return tokens;
}

function renderJsonCode(value) {
  return renderJsonTokens(JSON.stringify(value ?? null, null, 2));
}

function renderJsonPreviewCode(value) {
  return renderJsonTokens(String(value || ''));
}

function dbValuePreview(value, maxLength = 180) {
  if (value === null) return 'null';
  if (value === undefined || value === '') return '-';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = value.id ?? value.valueId ?? value.branchId;
    const label = value.label ?? value.name;
    if (id !== undefined && id !== null && String(id).trim() && label !== undefined && label !== null && String(label).trim()) {
      return `${String(id).trim()}-${String(label).trim()}`;
    }
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return compactText(text, maxLength);
}

function dbValueFullText(value) {
  if (value === null) return 'null';
  if (value === undefined || value === '') return '-';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function dbValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `数组(${value.length})`;
  if (typeof value === 'object') return `对象(${Object.keys(value).length})`;
  if (typeof value === 'string') return '文本';
  if (typeof value === 'number') return '数字';
  if (typeof value === 'boolean') return '布尔';
  return typeof value;
}

function dbValueMode(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const mode = value.valueMode ?? value.mode ?? value.valueType;
    if (mode !== undefined && mode !== null) {
      const text = String(mode).trim();
      if (text) return text;
    }
  }
  return dbValueType(value);
}

function dbObjectEntries(value, limit = Infinity) {
  if (Array.isArray(value)) return value.slice(0, limit).map((item, index) => ({ key: `[${index}]`, value: item }));
  if (value && typeof value === 'object') return Object.entries(value).slice(0, limit).map(([key, item]) => ({ key, value: item }));
  return value === undefined || value === null || value === '' ? [] : [{ key: 'value', value }];
}

function dbCollectionSummary(value) {
  if (Array.isArray(value)) return `${value.length} 项`;
  if (value && typeof value === 'object') return `${Object.keys(value).length} 个字段`;
  if (value === undefined || value === null || value === '') return '无数据';
  return dbValueType(value);
}

function dbFindNestedField(value, field, depth = 0) {
  if (!value || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = dbFindNestedField(item, field, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, field)) return value[field];
  for (const item of Object.values(value)) {
    const found = dbFindNestedField(item, field, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function dbDecodeEscapedText(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return text.replace(/\\(\\|n|r|t|")/g, (_, escape) => {
    if (escape === '\\') return '\\';
    if (escape === 'n') return '\n';
    if (escape === 'r') return '\r';
    if (escape === 't') return '\t';
    if (escape === '"') return '"';
    return escape;
  });
}

function dbLingxiSendInputsSummary(inputs) {
  const source = inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {};
  const fields = ['actionType', 'tagOperateType', 'actionContent', 'actionResult', 'actionMessage'];
  let content = source.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      content = null;
    }
  }
  const actionSource = content?.actions ?? source.actions ?? {};
  return Object.fromEntries(fields.map(field => {
    const key = Object.keys(source).find(item => item.toLowerCase() === field.toLowerCase());
    return [field, key ? source[key] : dbFindNestedField(actionSource, field) ?? dbFindNestedField(content, field) ?? ''];
  }));
}

function dbNodeOutputsSummary(outputs, preferredKeys = [], excludedKeys = []) {
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return outputs;
  const hiddenKeys = new Set(['eventid', 'tenantid', ...excludedKeys.map(key => String(key).toLowerCase())]);
  const entries = Object.entries(outputs).filter(([key]) => !hiddenKeys.has(String(key).toLowerCase()));
  const priority = preferredKeys.map(key => String(key).toLowerCase());
  const orderedEntries = priority.flatMap(key => entries.filter(([entryKey]) => String(entryKey).toLowerCase() === key));
  const remainingEntries = entries.filter(([entryKey]) => !priority.includes(String(entryKey).toLowerCase()));
  return Object.fromEntries([...orderedEntries, ...remainingEntries]);
}

function dbTriggerOutputsSummary(outputs) {
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return outputs;
  const conversationType = Number(outputs.conversationType) || 0;
  const conversationTypeLabels = { 1: '1-一对一私聊消息', 2: '2-群聊消息', 3: '3-事件消息' };
  const eventSourceTypeLabels = { 1: '1-新好友SOP', 2: '2-标签 SOP', 3: '3-私聊 SOP' };
  const excludedKeys = new Set(['addtime', 'chatroomwxid', 'chatroomremoteid', 'eventid', 'tenantid']);
  if (conversationType !== 2) excludedKeys.add('chatroomname');
  if (conversationType !== 3) { excludedKeys.add('eventcontent'); excludedKeys.add('eventsourcetype'); }
  const orderedPairs = [];
  if (outputs.conversationType !== undefined && outputs.conversationType !== null) {
    orderedPairs.push(['conversationType', conversationTypeLabels[conversationType] || String(outputs.conversationType)]);
  }
  if (conversationType === 2 && outputs.chatRoomName) {
    orderedPairs.push(['chatRoomName', outputs.chatRoomName]);
  }
  if (conversationType === 3) {
    if (outputs.eventContent !== undefined && outputs.eventContent !== null) {
      orderedPairs.push(['eventContent', outputs.eventContent]);
    }
    if (outputs.eventSourceType !== undefined && outputs.eventSourceType !== null) {
      const sourceType = Number(outputs.eventSourceType) || 0;
      orderedPairs.push(['eventSourceType', eventSourceTypeLabels[sourceType] || String(outputs.eventSourceType)]);
    }
  }
  const originalPreferred = ['agentId', 'friendNick', 'latestMsgTime', 'input', 'tagList', 'inputList'];
  const usedKeys = new Set(orderedPairs.map(([key]) => String(key).toLowerCase()));
  const orderedOriginals = originalPreferred
    .map(key => [key, outputs[key]])
    .filter(([key, value]) => !usedKeys.has(String(key).toLowerCase()) && !excludedKeys.has(String(key).toLowerCase()) && value !== undefined && value !== null);
  return Object.fromEntries([...orderedPairs, ...orderedOriginals]);
}

const DB_TRIGGER_MESSAGE_FIELDS = [
  'input', 'addTime', 'agentId', 'tagList', 'inputList', 'requestId', 'friendNick',
  'chatRoomName', 'chatRoomWxId', 'eventContent', 'weworkCorpId', 'latestMsgTime',
  'lingxiAccount', 'weworkAccount', 'friendRemoteId', 'chatRoomTagList',
  'eventSourceType', 'chatRoomRemoteId', 'conversationType', 'friendExternalId',
  'inputMessageList', 'weworkAccountName', 'weworkAccountAlias', 'inputListMessageList'
];

function dbTriggerMessageJson(outputs) {
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return {};
  return Object.fromEntries(DB_TRIGGER_MESSAGE_FIELDS
    .filter(key => outputs[key] !== undefined)
    .map(key => [key, outputs[key]]));
}

function dbTriggerValueList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value !== 'string') return value === undefined || value === null || value === '' ? [] : [String(value)];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item || '').trim()).filter(Boolean) : [value];
  } catch {
    return value ? [value] : [];
  }
}

function DbTriggerCaseSessionFields({ fields, values, onChange }) {
  return <div className="db-trigger-case-session-grid">
    {fields.map(([key, label]) => <label key={key} className="db-trigger-case-session-field">
      <span>{label}</span>
      <Input value={values[key] || ''} onChange={event => onChange(key, event.target.value)} />
    </label>)}
  </div>;
}

function DbTriggerOutputActions({ outputs, triggerMessageId, scenarios = [], userTags = [] }) {
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState('');
  const caseSavingRef = useRef(false);
  const [caseName, setCaseName] = useState('');
  const [businessScenario, setBusinessScenario] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [tagList, setTagList] = useState([]);
  const [sessionValues, setSessionValues] = useState({});
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [availableScenarios, setAvailableScenarios] = useState(scenarios);
  const payload = useMemo(() => dbTriggerMessageJson(outputs), [outputs]);
  const hasMessage = Object.keys(payload).length > 0;
  const copyPayload = useMemo(() => {
    const value = String(triggerMessageId || '').trim();
    return value ? { ...payload, trigger_message_id: value } : payload;
  }, [payload, triggerMessageId]);
  const defaultName = useMemo(() => {
    const identity = String(payload.friendNick || payload.agentId || '触发器消息').trim();
    const timestamp = String(payload.latestMsgTime || payload.addTime || '').trim().replace(/[\\/:\s]+/g, '-');
    return [identity, timestamp].filter(Boolean).join('-') || '触发器测试用例';
  }, [payload]);
  const sessionFields = [
    ['friendNick', '好友昵称'],
    ['weworkAccountAlias', '企微账号别名'],
    ['lingxiAccount', '灵犀后台账号名'],
    ['latestMsgTime', '最新消息时间'],
    ['addTime', '添加时间']
  ];
  const draftPayload = useMemo(() => ({ ...payload, ...sessionValues, tagList }), [payload, sessionValues, tagList]);
  useEffect(() => setAvailableScenarios(scenarios), [scenarios]);
  const scenarioOptions = useMemo(() => {
    const search = scenarioSearch.trim();
    return [...new Set([...availableScenarios, businessScenario].filter(Boolean))]
      .filter(value => !search || value.includes(search))
      .map(value => ({ value, label: value }));
  }, [availableScenarios, businessScenario, scenarioSearch]);
  const canCreateScenario = scenarioSearch.trim() && ![...availableScenarios, businessScenario].filter(Boolean).includes(scenarioSearch.trim());
  const createBusinessScenario = async () => {
    const value = scenarioSearch.trim();
    if (!value) return;
    setBusinessScenario(value);
    setAvailableScenarios(current => [...new Set([...current, value])]);
    setScenarioSearch('');
    await window.saveCaseLabels?.({ businessScenarios: [value] });
  };
  const openCaseModal = () => {
    setCaseName(defaultName);
    setBusinessScenario('');
    setExpectedResult('');
    setTagList(dbTriggerValueList(payload.tagList));
    setSessionValues(Object.fromEntries(sessionFields.map(([key]) => [key, payload[key] ?? ''])));
    setScenarioSearch('');
    setCaseModalOpen(true);
  };
  const confirmSave = async () => {
    if (caseSavingRef.current) return;
    caseSavingRef.current = true;
    setCaseSaving(true);
    try {
      const created = await window.saveTriggerOutputAsCase(
        draftPayload,
        caseName.trim() || defaultName,
        businessScenario.trim(),
        expectedResult.trim()
      );
      if (!created?.id) return;
      setCaseModalOpen(false);
      setCreatedCaseId(created.id);
    } catch (error) {
      message.error(error.message || '创建失败，请重试');
    } finally {
      caseSavingRef.current = false;
      setCaseSaving(false);
    }
  };
  const copyDraftJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draftPayload, null, 2));
      message.success('已复制保存消息 JSON');
    } catch {
      message.error('复制失败，请重试');
    }
  };
  return <>
    <Flex className="db-trigger-output-actions" justify="end" gap={8} wrap>
      <Button size="small" icon={<SaveOutlined />} disabled={!hasMessage} onClick={openCaseModal}>存为测试用例</Button>
      <Button size="small" type="primary" icon={<CopyOutlined />} disabled={!hasMessage} onClick={() => emitListToolbar('copy-trigger-output-json', { payload: copyPayload })}>复制消息 JSON</Button>
    </Flex>
    <Modal open={Boolean(createdCaseId)} centered title="创建成功" onCancel={() => setCreatedCaseId('')} footer={<Space>
      <Button onClick={() => {
        const id = createdCaseId;
        setCreatedCaseId('');
        emitListToolbar('open-created-trigger-case', { id });
      }}>查看用例</Button>
      <Button type="primary" onClick={() => setCreatedCaseId('')}>确 定</Button>
    </Space>}>
      <p>测试用例创建成功。</p>
    </Modal>
    <Modal className="db-trigger-case-modal" open={caseModalOpen} centered width={980} destroyOnHidden title="存为测试用例" okText="创建测试用例" cancelText="取消" confirmLoading={caseSaving} cancelButtonProps={{ disabled: caseSaving }} closable={!caseSaving} maskClosable={!caseSaving} keyboard={!caseSaving} onCancel={() => setCaseModalOpen(false)} onOk={confirmSave}>
      <div className="db-trigger-case-modal-layout">
        <div className="db-trigger-case-information">
          <div className="db-trigger-case-form-fields">
            <label className="db-trigger-case-field"><span>测试用例名称</span><Input value={caseName} maxLength={100} onChange={event => setCaseName(event.target.value)} placeholder="请输入测试用例名称" /></label>
            <label className="db-trigger-case-field"><span>业务场景</span><Select showSearch allowClear filterOption={false} value={businessScenario || undefined} placeholder="选择或创建业务场景" searchValue={scenarioSearch} onSearch={setScenarioSearch} options={scenarioOptions} onChange={value => { setBusinessScenario(String(value || '').trim()); setScenarioSearch(''); }} onClear={() => { setBusinessScenario(''); setScenarioSearch(''); }} popupRender={origin => <>{origin}{canCreateScenario ? <Button type="link" block onMouseDown={event => event.preventDefault()} onClick={createBusinessScenario}>创建“{scenarioSearch.trim()}”</Button> : null}</>} /></label>
            <label className="db-trigger-case-field"><span>备注</span><Input.TextArea value={expectedResult} maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} onChange={event => setExpectedResult(event.target.value)} placeholder="测试目的、特殊说明或预期结果（可选）" /></label>
          </div>
          <section className="db-trigger-case-section db-trigger-tag-section">
            <label className="db-trigger-case-field"><span>用户标签（tagList）</span><Select className="db-trigger-tag-select" mode="tags" value={tagList} options={userTags.map(value => ({ value, label: value }))} onChange={values => setTagList(values.map(value => String(value || '').trim()).filter(Boolean))} tokenSeparators={[',', '，', ';']} placeholder="输入后按 Enter 添加标签" /></label>
          </section>
          <section className="db-trigger-case-section">
            <DbTriggerCaseSessionFields fields={sessionFields} values={sessionValues} onChange={(key, value) => setSessionValues(current => ({ ...current, [key]: value }))} />
          </section>
        </div>
        <section className="db-trigger-case-json-preview">
          <Flex className="db-trigger-case-json-preview-head" justify="space-between" align="center"><span>保存消息 JSON</span><Tooltip title="复制 JSON"><Button type="text" size="small" className="db-trigger-case-json-copy" icon={<CopyOutlined />} aria-label="复制保存消息 JSON" onClick={copyDraftJson} /></Tooltip></Flex>
          <pre><code>{renderJsonCode(draftPayload)}</code></pre>
        </section>
      </div>
    </Modal>
  </>;
}

function dbConditionInputsSummary(inputs) {
  const branches = Array.isArray(inputs?.branches) ? inputs.branches : [];
  const fieldValues = new Map();
  const appendValue = (field, value) => {
    const key = String(field || '').trim();
    if (key === '@trigger.user_input') return;
    if (!key || value === undefined || value === null || value === '') return;
    const values = Array.isArray(value) ? value : [value];
    if (!fieldValues.has(key)) fieldValues.set(key, []);
    const target = fieldValues.get(key);
    values.forEach(item => {
      const text = dbValuePreview(item, 120);
      if (text && text !== '-' && !target.includes(text)) target.push(text);
    });
  };
  const collectConditions = conditions => {
    (Array.isArray(conditions) ? conditions : []).forEach(condition => {
      if (Array.isArray(condition?.conditions)) collectConditions(condition.conditions);
      appendValue(condition?.field, condition?.__fieldValue);
    });
  };
  branches.forEach(branch => collectConditions(branch?.conditions));
  return Object.fromEntries([...fieldValues.entries()].map(([field, values]) => [field, values.join('；') || '-']));
}

function dbConditionLogicLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['or', 'any', 'any_match', 'first_match', 'some', '||'].includes(normalized)) return 'OR';
  if (['and', 'all', 'all_match', 'every', '&&'].includes(normalized)) return 'AND';
  return value ? String(value).toUpperCase() : 'AND';
}

function dbConditionOperatorLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const labels = {
    eq: '等于',
    equal: '等于',
    equals: '等于',
    '==': '等于',
    '===': '等于',
    ne: '不等于',
    neq: '不等于',
    not_equal: '不等于',
    '!=': '不等于',
    '!==': '不等于',
    contains: '包含',
    not_contains: '不包含',
    include: '包含',
    includes: '包含',
    gt: '大于',
    '>': '大于',
    gte: '大于等于',
    '>=': '大于等于',
    lt: '小于',
    '<': '小于',
    lte: '小于等于',
    '<=': '小于等于',
    empty: '为空',
    is_empty: '为空',
    not_empty: '不为空',
    is_not_empty: '不为空',
    in: '属于',
    not_in: '不属于',
    starts_with: '开头为',
    ends_with: '结尾为',
    regex: '匹配正则'
  };
  return labels[normalized] || value || '判断';
}

function dbConditionNodeValue(value, maxLength = 160) {
  if (Array.isArray(value)) return value.map(item => dbValuePreview(item, 60)).join('、') || '-';
  return dbValuePreview(value, maxLength);
}

function dbResolveNodeReference(value, nodeNameById = new Map()) {
  return String(value || '').replace(/@node\.([^.]+)\.([^.@\s]+)/g, (_, nodeId, field) => {
    const nodeName = nodeNameById.get(nodeId) || nodeId;
    return `${nodeName}/${field}`;
  });
}

function dbResolveNodeReferencesDeep(value, nodeNameById = new Map()) {
  if (!nodeNameById.size) return value;
  if (typeof value === 'string') return dbResolveNodeReference(value, nodeNameById);
  if (Array.isArray(value)) return value.map(item => dbResolveNodeReferencesDeep(item, nodeNameById));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const resolvedKey = dbResolveNodeReference(key, nodeNameById);
      result[resolvedKey] = dbResolveNodeReferencesDeep(item, nodeNameById);
    }
    return result;
  }
  return value;
}

function dbVariableLabel(value, maxLength = 160) {
  return dbConditionNodeValue(value, maxLength)
    .replace(/^@trigger\./, '触发数据/')
    .replace(/^@conversation\./, '会话变量/');
}

function dbConditionConditionParts(condition) {
  const field = condition?.field ?? condition?.variableKey ?? condition?.leftValue ?? condition?.left ?? condition?.key ?? '-';
  const operator = condition?.operator ?? condition?.compareOperator ?? condition?.operation ?? condition?.comparator ?? condition?.condition ?? '';
  const targetValue = condition?.value ?? condition?.targetValue ?? condition?.rightValue ?? condition?.compareValue ?? condition?.expectedValue ?? condition?.fieldValue ?? '';
  const runtimeValue = condition?.__fieldValue ?? condition?.fieldValueActual ?? condition?.actualValue;
  const valueMode = condition?.valueMode ?? condition?.valueType ?? condition?.type;
  return { field, operator, targetValue, runtimeValue, valueMode };
}

function dbConditionChildrenOf(item) {
  if (Array.isArray(item)) return item;
  if (Array.isArray(item?.conditions)) return item.conditions;
  if (Array.isArray(item?.children)) return item.children;
  if (Array.isArray(item?.items)) return item.items;
  return [];
}

function dbConditionGroupLogic(item, fallback = 'and') {
  return item?.logic ?? item?.logicalOperator ?? item?.operator ?? item?.relation ?? item?.combinator ?? item?.matchType ?? item?.mode ?? fallback;
}

function dbConditionHasOwnRule(condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
  return [
    'field',
    'variableKey',
    'leftValue',
    'left',
    'key',
    'operator',
    'compareOperator',
    'operation',
    'comparator',
    'condition',
    'value',
    'targetValue',
    'rightValue',
    'compareValue',
    'expectedValue',
    'fieldValue'
  ].some(key => Object.prototype.hasOwnProperty.call(condition, key));
}

function dbConditionVisibleItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => dbConditionHasOwnRule(item) || dbConditionVisibleItems(dbConditionChildrenOf(item)).length);
}

function dbConditionIsGroup(item) {
  if (Array.isArray(item)) return dbConditionVisibleItems(item).length > 0;
  if (!item || typeof item !== 'object') return false;
  const type = String(item.type || '').trim().toLowerCase();
  const hasChildren = dbConditionVisibleItems(dbConditionChildrenOf(item)).length > 0;
  return hasChildren && (type === 'group' || !dbConditionHasOwnRule(item));
}

function dbAgentInputsSummary(inputs) {
  const source = inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {};
  const excludedKeys = new Set(['outputs', 'maxtokens', 'endpointid', 'outputschema']);
  const orderedEntries = [];
  const pushEntry = (key, value) => {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    if (excludedKeys.has(normalized.toLowerCase())) return;
    const decodedValue = ['systemPrompt', 'userPrompt'].includes(normalized) && typeof value === 'string'
      ? dbDecodeEscapedText(value)
      : value;
    orderedEntries.push({ key: normalized, value: decodedValue });
  };
  ['systemPrompt', 'userPrompt'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) pushEntry(key, source[key]);
  });
  Object.entries(source).forEach(([key, value]) => {
    if (['systemPrompt', 'userPrompt'].includes(key)) return;
    pushEntry(key, value);
  });
  return orderedEntries;
}

function dbSetVariableAssignmentsSummary(source, fieldMap = {}) {
  const {
    keyField = 'key',
    typeField = 'valueType',
    valueField = 'value'
  } = fieldMap;
  const assignments = !source || typeof source !== 'object' || Array.isArray(source) || !Array.isArray(source.assignments)
    ? []
    : source.assignments;
  const rows = [];
  const seen = new Set();
  assignments.forEach(item => {
    const key = String(item?.key || item?.variableKey || item?.name || '').trim();
    if (!key) return;
    const value = item?.value ?? item?.variableValue ?? item?.defaultValue ?? '';
    const valueType = String(item?.valueType || item?.valueMode || item?.type || dbValueType(value)).trim() || dbValueType(value);
    const marker = `${key}\n${valueType}\n${JSON.stringify(value)}`;
    if (seen.has(marker)) return;
    seen.add(marker);
    rows.push({
      [keyField]: item?.variableKey || item?.key || item?.name || key,
      [typeField]: item?.valueMode || item?.valueType || item?.type || valueType,
      [valueField]: item?.variableValue ?? item?.value ?? item?.defaultValue ?? value
    });
  });
  return rows;
}

function dbSnapshotChanges(before, after, limit = 8) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((left, right) => left.localeCompare(right));
  return keys
    .map(key => {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      const beforeText = hasBefore ? JSON.stringify(before[key]) : undefined;
      const afterText = hasAfter ? JSON.stringify(after[key]) : undefined;
      if (beforeText === afterText) return null;
      return {
        key,
        state: !hasBefore ? 'added' : !hasAfter ? 'removed' : 'changed',
        before: hasBefore ? before[key] : undefined,
        after: hasAfter ? after[key] : undefined
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

function dbStatusColor(status) {
  if (isDbExecutionSuccess(status)) return 'green';
  if (!status || status === '未执行') return undefined;
  return 'red';
}

function DbNodeJsonBlock({ title, value }) {
  return <section className="db-node-json"><Text strong>{title}</Text><pre><code>{renderJsonCode(value)}</code></pre></section>;
}

function DbConditionRuleView({ condition, depth = 0 }) {
  if (dbConditionIsGroup(condition)) return <DbConditionGroupView group={condition} conditions={dbConditionChildrenOf(condition)} depth={depth} />;
  const parts = dbConditionConditionParts(condition);
  return <div className="db-condition-rule">
    <span className="db-condition-rule-field" title={dbConditionNodeValue(parts.field, 400)}>{dbVariableLabel(parts.field, 400)}</span>
    <span className="db-condition-rule-operator">{dbConditionOperatorLabel(parts.operator)}</span>
    <span className="db-condition-rule-value" title={dbConditionNodeValue(parts.targetValue, 400)}>{dbConditionNodeValue(parts.targetValue, 120)}</span>
    {parts.runtimeValue !== undefined ? <span className="db-condition-rule-runtime" title={dbConditionNodeValue(parts.runtimeValue, 400)}>传入：{dbConditionNodeValue(parts.runtimeValue, 120)}</span> : null}
  </div>;
}

function DbConditionConnector({ logic }) {
  const label = dbConditionLogicLabel(logic);
  return <div className={`db-condition-connector ${label.toLowerCase()}`}>
    <span>{label}</span>
  </div>;
}

function DbConditionGroupView({ group, conditions, depth = 0 }) {
  const visibleConditions = dbConditionVisibleItems(conditions);
  const fallbackLogic = dbConditionGroupLogic(group);
  return <div className={`db-condition-group depth-${Math.min(depth, 3)}`}>
    {depth > 0 ? <div className="db-condition-group-head">
      <Tag className="db-condition-group-tag" bordered={false}>条件组</Tag>
      <Text type="secondary">{visibleConditions.length} 个判断</Text>
    </div> : null}
    <div className="db-condition-group-body">
      {visibleConditions.length ? visibleConditions.map((condition, index) => <React.Fragment key={`${index}-${JSON.stringify(condition).slice(0, 80)}`}>
        {index > 0 ? <DbConditionConnector logic={condition?.logic ?? fallbackLogic} /> : null}
        <DbConditionRuleView condition={condition} depth={depth + 1} />
      </React.Fragment>) : <Text type="secondary">暂无判断条件</Text>}
    </div>
  </div>;
}

function DbConditionConfigPanel({ config }) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const branches = Array.isArray(source.branches) ? source.branches : [];
  const defaultBranch = source.defaultBranch;
  return <Flex vertical gap={12}>
    <section className="db-node-panel db-condition-config-panel">
      <div className="db-node-panel-title">
        <span>条件可视化</span>
        <Text type="secondary">{branches.length ? `${branches.length} 个分支` : '无分支'}</Text>
      </div>
      {branches.length ? <div className="db-condition-branch-list">
        {branches.map((branch, index) => {
          const conditions = dbConditionVisibleItems(dbConditionChildrenOf(branch));
          const branchId = String(branch?.id || '').trim();
          const branchLabel = String(branch?.label || branch?.name || branchId || `分支 ${index + 1}`).trim();
          return <article key={`${branchId || index}-${branchLabel}`} className="db-condition-branch-card">
            <div className="db-condition-branch-head">
              <span className="db-condition-branch-title" title={branchLabel}>{branchLabel}</span>
              <Space size={6} wrap>
                <Tag className="db-condition-branch-index" bordered={false}>分支 {index + 1}</Tag>
                {branchId && branchId !== branchLabel ? <Text type="secondary" className="db-condition-branch-id">{branchId}</Text> : null}
              </Space>
            </div>
            <DbConditionGroupView group={branch} conditions={conditions} />
          </article>;
        })}
        {defaultBranch ? <article className="db-condition-branch-card default">
          <div className="db-condition-branch-head">
            <span className="db-condition-branch-title">默认分支</span>
            <Tag bordered={false}>未命中时进入</Tag>
          </div>
          <div className="db-condition-default-target" title={dbConditionNodeValue(defaultBranch, 400)}>{dbConditionNodeValue(defaultBranch, 160)}</div>
        </article> : null}
      </div> : <Text type="secondary">暂无条件分支配置。</Text>}
    </section>
    <DbNodeJsonBlock title="节点参数配置 JSON" value={config} />
  </Flex>;
}

function dbInputListMessage(value) {
  const raw = String(value ?? '');
  const delimiter = raw.indexOf(':');
  const messageId = delimiter >= 0 ? raw.slice(0, delimiter).trim() : '';
  const content = delimiter >= 0 ? raw.slice(delimiter + 1) : raw;
  const firstCharacter = messageId.charAt(0);
  const role = firstCharacter === '7' ? 'student' : 'teacher';
  return { messageId, content, role };
}

function DbNodeInputListPreview({ value }) {
  const messages = (Array.isArray(value) ? value : []).map(dbInputListMessage).filter(message => message.content.trim());
  const [expanded, setExpanded] = useState(false);
  const visibleMessages = expanded ? messages : messages.slice(-3);
  const canExpand = messages.length > 3;
  return <div className={`db-node-input-list${expanded ? ' expanded' : ''}`} aria-label="历史聊天记录">
    {visibleMessages.map((message, index) => <div key={`${message.messageId}-${index}`} className={`db-node-input-list-message ${message.role}`}>
      <span className="db-node-input-message-role">{message.role === 'teacher' ? '老师' : '学员'}</span>
      <span className="db-node-input-list-content" title={message.messageId || undefined}>{message.content}</span>
    </div>)}
    {canExpand ? <Button
      type="link"
      size="small"
      className="db-node-input-list-toggle"
      icon={expanded ? <UpOutlined /> : <DownOutlined />}
      onClick={() => setExpanded(current => !current)}
    >{expanded ? '收起聊天记录' : `展开全部聊天记录（共 ${messages.length} 条）`}</Button> : null}
  </div>;
}

function DbNodeLatestInputPreview({ value }) {
  const messages = (Array.isArray(value) ? value : [value]).map(item => dbValuePreview(item, 400)).filter(item => item && item !== '-');
  return <div className="db-node-input-latest" aria-label="学员最新消息">
    {messages.map((message, index) => <div key={`${index}-${message}`} className="db-node-input-message student">
      <span className="db-node-input-message-bubble">{message}</span>
    </div>)}
  </div>;
}

function DbNodeValuePanel({ title, value, typeLabel = dbValueType, showType = true, arrayAsTags = false, inputListAsMessages = false, inputAsStudentMessage = false, fullValueKeys = [], titleExtra = null }) {
  const entries = dbObjectEntries(value);
  const orderedEntries = inputListAsMessages
    ? [...entries].sort((left, right) => Number(String(left.key).toLowerCase() === 'inputlist') - Number(String(right.key).toLowerCase() === 'inputlist'))
    : entries;
  const parseVariableLabel = title === 'Inputs 摘要';
  const fullValueKeySet = new Set(fullValueKeys.map(key => String(key).toLowerCase()));
  return <section className="db-node-panel">
    <div className="db-node-panel-title"><span>{title}</span>{titleExtra || <Text type="secondary">{dbCollectionSummary(value)}</Text>}</div>
    {entries.length ? <div className="db-node-value-list">
      {orderedEntries.map(item => <div key={item.key} className={`db-node-value-row${showType ? '' : ' without-type'}`}>
        <span className="db-node-value-key" title={item.key}>{parseVariableLabel ? dbVariableLabel(item.key, 160) : item.key}</span>
        {showType ? <span className="db-node-value-type">{typeLabel(item.value)}</span> : null}
        {inputListAsMessages && String(item.key).toLowerCase() === 'inputlist' && Array.isArray(item.value) ? <DbNodeInputListPreview value={item.value} /> : inputAsStudentMessage && String(item.key).toLowerCase() === 'input' ? <DbNodeLatestInputPreview value={item.value} /> : arrayAsTags && Array.isArray(item.value) ? <span className="db-node-value-preview db-node-value-tags" title={dbValuePreview(item.value, 400)}>
          {item.value.length ? item.value.map((value, index) => <Tag key={`${index}-${dbValuePreview(value, 120)}`} bordered={false}>{dbValuePreview(value, 120)}</Tag>) : '-'}
        </span> : fullValueKeySet.has(String(item.key).toLowerCase()) ? <span className="db-node-value-preview db-node-value-preview-full" title={dbValueFullText(item.value)}>{dbValueFullText(item.value)}</span> : <span className="db-node-value-preview" title={dbValuePreview(item.value, 400)}>{dbValuePreview(item.value)}</span>}
      </div>)}
    </div> : <Text type="secondary">暂无数据</Text>}
  </section>;
}

function DbNodeAgentInputsPanel({ inputs }) {
  const entries = dbAgentInputsSummary(inputs);
  const [expandedPrompts, setExpandedPrompts] = useState({ systemPrompt: false, userPrompt: false });
  useEffect(() => {
    setExpandedPrompts({ systemPrompt: false, userPrompt: false });
  }, [inputs]);
  return <section className="db-node-panel">
    <div className="db-node-panel-title"><span>Inputs 摘要</span><Text type="secondary">{entries.length ? `${entries.length} 个字段` : '无数据'}</Text></div>
    {entries.length ? <div className="db-node-agent-input-list">
      {entries.map(item => {
        const isPrompt = item.key === 'systemPrompt' || item.key === 'userPrompt';
        const displayValue = isPrompt ? dbDecodeEscapedText(item.value) : dbValuePreview(item.value, 400);
        const isExpanded = isPrompt ? Boolean(expandedPrompts[item.key]) : true;
        return <div key={item.key} className={`db-node-agent-input-row${isPrompt ? ` prompt ${isExpanded ? 'expanded' : 'collapsed'}` : ''}`}>
          <div className="db-node-agent-input-row-head">
            <span className="db-node-agent-input-key" title={item.key}>{dbVariableLabel(item.key, 160)}</span>
            {isPrompt ? <Button
              type="text"
              size="small"
              className="db-node-agent-input-toggle"
              icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setExpandedPrompts(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
            >{isExpanded ? '收起' : '展开'}</Button> : null}
          </div>
          <span
            className={`db-node-agent-input-value${isPrompt ? ' prompt-value' : ''}`}
            title={isPrompt ? displayValue : typeof item.value === 'string' ? item.value : dbValuePreview(item.value, 400)}
          >
            {displayValue || '-'}
          </span>
        </div>;
      })}
    </div> : <Text type="secondary">暂无数据</Text>}
  </section>;
}

function DbNodeAssignmentsPanel({ title, assignments, showValueType = false }) {
  const parseVariableLabel = title === 'Inputs 摘要';
  return <section className="db-node-panel">
    <div className="db-node-panel-title"><span>{title}</span><Text type="secondary">{assignments.length ? `${assignments.length} 个字段` : '无数据'}</Text></div>
    {assignments.length ? <div className="db-node-assignments-list">
      {assignments.map(item => {
        const key = item.key ?? item.variableKey ?? item.name ?? '-';
        const valueType = item.valueType ?? item.valueMode ?? item.type ?? dbValueType(item.value ?? item.variableValue ?? item.defaultValue);
        const value = item.value ?? item.variableValue ?? item.defaultValue ?? '';
        return <div key={`${key}-${valueType || ''}-${JSON.stringify(value)}`} className={`db-node-assignments-row${showValueType ? ' has-type' : ''}`}>
          <span className="db-node-assignments-key" title={key}>{parseVariableLabel ? dbVariableLabel(key, 160) : key}</span>
          {showValueType ? <span className="db-node-value-type">{valueType}</span> : null}
          <span className="db-node-assignments-value" title={dbValuePreview(value, 400)}>{dbValuePreview(value, 400)}</span>
        </div>;
      })}
    </div> : <Text type="secondary">暂无数据</Text>}
  </section>;
}

function DbNodeSnapshotPanel({ before, after }) {
  const changes = dbSnapshotChanges(before, after);
  return <section className="db-node-panel">
    <div className="db-node-panel-title"><span>变量变化</span><Text type="secondary">{changes.length ? `${changes.length} 处变化` : '无变化'}</Text></div>
    {changes.length ? <div className="db-node-change-list">
      {changes.map(change => <div key={change.key} className={`db-node-change-row ${change.state}`}>
        <span className="db-node-change-key" title={change.key}>{change.key}</span>
        <Tag className="db-node-change-tag" color={change.state === 'added' ? 'green' : change.state === 'removed' ? 'red' : 'blue'}>{change.state === 'added' ? '新增' : change.state === 'removed' ? '删除' : '变更'}</Tag>
        <span className="db-node-change-value" title={dbValuePreview(change.before, 400)}>{dbValuePreview(change.before, 90)}</span>
        <span className="db-node-change-arrow">→</span>
        <span className="db-node-change-value" title={dbValuePreview(change.after, 400)}>{dbValuePreview(change.after, 90)}</span>
      </div>)}
    </div> : <Text type="secondary">Before Snapshot 与 After Snapshot 未发现字段差异。</Text>}
  </section>;
}

function DbNodeRawDataCollapse({ node }) {
  return <Collapse
    className="db-node-raw-collapse"
    bordered={false}
    items={[{
      key: 'raw',
      label: '原始数据',
      children: <Flex vertical gap={12}>
        <DbNodeJsonBlock title="Inputs" value={node.inputs} />
        <DbNodeJsonBlock title="Outputs" value={node.outputs} />
        <DbNodeJsonBlock title="Logs" value={node.logs} />
      </Flex>
    }]}
  />;
}

function DbNodeRunId({ runId }) {
  if (!runId) return null;
  return <div className="db-node-run-id-footer">
    <Text type="secondary">运行 ID</Text>
    <Text className="db-node-summary-run-id" copyable ellipsis={{ tooltip: runId }}>{runId}</Text>
  </div>;
}

function DbNodeDrawerTitle({ node, meta }) {
  const Icon = meta.icon;
  const nodeTitle = node?.nodeName || node?.nodeId || '节点详情';
  const nodeId = node?.nodeId || '-';
  return <div className="db-node-drawer-title">
    <span className="db-node-drawer-icon" style={{ backgroundColor: meta.color, color: '#fff' }}><Icon /></span>
    <span className="db-node-drawer-title-content">
      <span className="db-node-drawer-name" title={nodeTitle}>{nodeTitle}</span>
      <span className="db-node-drawer-meta">
        <span className="db-node-drawer-type">{meta.name}</span>
        <span className="db-node-drawer-id-label">ID:</span>
        <span className="db-node-drawer-id" title={nodeId}>{nodeId}</span>
      </span>
    </span>
  </div>;
}

function DbNodeDrawer({ node, onClose, loading = false, nodeNameById = new Map(), scenarios = [], userTags = [] }) {
  const nodeType = String(node?.nodeType || '').toLowerCase();
  const resolvedNode = useMemo(() => dbResolveNodeReferencesDeep(node, nodeNameById), [node, nodeNameById]);
  const isSetVariable = nodeType === 'set_variable';
  const showInputsSummary = nodeType !== 'lingxi_trigger';
  const showOutputsSummary = nodeType !== 'lingxi_send';
  const inputsSummary = nodeType === 'condition'
    ? dbConditionInputsSummary(resolvedNode?.inputs)
    : nodeType === 'lingxi_send'
      ? dbLingxiSendInputsSummary(resolvedNode?.inputs)
      : resolvedNode?.inputs;
  const setVariableInputAssignments = nodeType === 'set_variable' ? dbSetVariableAssignmentsSummary(resolvedNode?.inputs, { keyField: 'variableKey', typeField: 'valueMode', valueField: 'variableValue' }) : [];
  const setVariableOutputAssignments = nodeType === 'set_variable' ? dbSetVariableAssignmentsSummary(resolvedNode?.outputs) : [];
  const triggerOutputs = resolvedNode?.outputs || resolvedNode?.previewOutputs || {};
  const outputsSummary = nodeType === 'lingxi_trigger' ? dbTriggerOutputsSummary(triggerOutputs) : dbNodeOutputsSummary(resolvedNode?.outputs || resolvedNode?.previewOutputs, ['inputList'], []);
  const meta = dbNodeMeta(node?.nodeType);
  const isSuccess = isDbExecutionSuccess(node?.status);
  const statusText = node?.status || '-';
  const statusDetail = isSuccess ? <>{node?.durationMs || 0}<small> ms</small></> : node?.errorClass || node?.errorCode || '-';
  const executionContent = !node ? null : loading ? <Flex justify="center" style={{ padding: '48px 0' }}><Spin description="正在加载节点执行详情" /></Flex> : !node.detailsLoaded && node.id ? <Text type="secondary">节点执行详情暂不可用</Text> : !node.id ? <Text type="secondary">该节点未参与本次执行</Text> : <Flex vertical gap={12}>
    <div className={`db-node-summary ${isSuccess ? 'success' : 'failed'}`}>
      <div className="db-node-summary-result">
        {isSuccess ? <CheckCircleFilled /> : <CloseCircleFilled />}
        <div><span className="db-node-summary-status-text">{statusText}</span><strong className={isSuccess ? '' : 'failure-detail'}>{statusDetail}</strong></div>
      </div>
      <div className="db-node-summary-row"><Text type="secondary">开始时间</Text><Text>{node.startedAt || '-'}</Text></div>
    </div>
    {node.errorMessage ? <Alert type="error" message={node.errorMessage} /> : null}
    {showOutputsSummary ? nodeType === 'set_variable' ? <DbNodeAssignmentsPanel title="Outputs 摘要" assignments={setVariableOutputAssignments} showValueType /> : <DbNodeValuePanel title="Outputs 摘要" value={outputsSummary} showType={nodeType !== 'condition' && nodeType !== 'lingxi_trigger'} arrayAsTags inputListAsMessages inputAsStudentMessage={nodeType === 'lingxi_trigger'} fullValueKeys={nodeType === 'agent' ? ['output'] : []} titleExtra={nodeType === 'lingxi_trigger' ? <DbTriggerOutputActions outputs={triggerOutputs} triggerMessageId={node?.triggerMessageId || node?.trigger_message_id} scenarios={scenarios} userTags={userTags} /> : null} /> : null}
    {showInputsSummary ? nodeType === 'agent' ? <DbNodeAgentInputsPanel inputs={inputsSummary} /> : nodeType === 'set_variable' ? <DbNodeAssignmentsPanel title="Inputs 摘要" assignments={setVariableInputAssignments} showValueType /> : <DbNodeValuePanel title="Inputs 摘要" value={inputsSummary} typeLabel={dbValueMode} showType={nodeType !== 'lingxi_send'} /> : null}
    {isSetVariable ? <DbNodeSnapshotPanel before={resolvedNode.beforeSnapshot} after={resolvedNode.afterSnapshot} /> : null}
    <DbNodeRawDataCollapse node={resolvedNode} />
    <DbNodeRunId runId={node.runId} />
  </Flex>;
  return <Drawer className="db-node-drawer" open={Boolean(node)} width={680} title={<DbNodeDrawerTitle node={node} meta={meta} />} onClose={onClose} destroyOnHidden>
    {node ? <Tabs className="db-node-drawer-tabs" defaultActiveKey="execution" items={[
      { key: 'execution', label: '执行详情', children: executionContent },
      { key: 'config', label: '节点参数配置', children: nodeType === 'condition' ? <DbConditionConfigPanel config={resolvedNode.nodeConfig} /> : <DbNodeJsonBlock title="节点参数配置" value={resolvedNode.nodeConfig} /> }
    ]} /> : null}
  </Drawer>;
}

function renderDbMessageText(value) {
  return value === null ? 'null' : String(value || '-');
}

function groupDbConversationMessages(messages) {
  const groups = [];
  const groupsByTriggerMessageId = new Map();
  (messages || []).forEach(message => {
    const triggerMessageId = message.triggerMessageId || message.id;
    if (!groupsByTriggerMessageId.has(triggerMessageId)) {
      const group = { triggerMessageId, user: null, assistant: null, actions: [] };
      groupsByTriggerMessageId.set(triggerMessageId, group);
      groups.push(group);
    }
    const group = groupsByTriggerMessageId.get(triggerMessageId);
    const role = String(message.role || '').toUpperCase();
    if (role === 'USER') group.user = group.user || message;
    else if (role === 'ASSISTANT') group.assistant = group.assistant || message;
    else if (role === 'ACTION') group.actions.push(message);
  });
  return groups.sort((left, right) => {
    const leftTime = left.user?.messageTimestamp || left.assistant?.messageTimestamp || '';
    const rightTime = right.user?.messageTimestamp || right.assistant?.messageTimestamp || '';
    return String(leftTime).localeCompare(String(rightTime));
  });
}

function DbConversationTranscript({ detail }) {
  const messageGroups = groupDbConversationMessages(detail?.messages || []);
  const errorTriggerMessageIds = new Set(Object.entries(detail?.executionsByTrigger || {})
    .filter(([, executions]) => executions.some(execution => isDbExecutionFailure(execution.status) || execution.errorMessage || execution.errorClass || execution.errorCode))
    .map(([triggerMessageId]) => triggerMessageId));
  if (!messageGroups.length) return <div className="db-conversation-preview-empty">暂无消息记录</div>;
  return <div className="db-conversation-preview-list">
    {messageGroups.map(group => {
      const userMessage = group.user || group.assistant;
      const assistantMessage = group.assistant;
      const conversationType = Number(userMessage?.conversationType) || 0;
      const isEventMessage = conversationType === 3;
      const chatRoomName = String(userMessage?.chatRoomName || '').trim();
      const hasError = errorTriggerMessageIds.has(group.triggerMessageId);
      const processing = userMessage?.processing === true;
      const pending = !processing && (userMessage?.isPending === true || userMessage?.processed === false);
      const noReply = !hasError && !pending && !processing && !userMessage?.failed && userMessage?.hasReplyAction === false;
      return <article key={group.triggerMessageId} className="db-message-item conversation db-message-transcript-item">
        <span className="db-message-section">
          {conversationType === 2 && chatRoomName ? <span className="db-message-chat-room"><Tag color="purple">群-{chatRoomName}</Tag></span> : null}
          <span className="db-message-meta"><span className={`db-message-role${isEventMessage ? ' event-message' : ''}`}>{isEventMessage ? '事件消息' : (detail.friendNick || '学员消息')}</span><span className="db-message-time">{userMessage?.messageTimestamp}</span>{pending || processing || noReply || hasError ? <span className="db-message-status-tags">{pending ? <Tag color="gold">待处理</Tag> : null}{processing ? <Tag className="db-message-processing-tag" color="blue">处理中</Tag> : null}{noReply ? <Tag color="default">不回复</Tag> : null}{hasError ? <Tag color="red">有错误</Tag> : null}</span> : null}</span>
          <span className="db-message-content">{renderDbMessageText(userMessage?.content)}</span>
        </span>
        {assistantMessage ? <span className="db-message-ai-reply">
          <span className="db-message-meta"><span className="db-message-role">AI回复</span>{assistantMessage.messageTimestamp ? <span className="db-message-time">{assistantMessage.messageTimestamp}</span> : null}</span>
          <span className="db-message-content">{assistantMessage.content === '' ? '\u00a0' : renderDbMessageText(assistantMessage.content)}</span>
        </span> : null}
      </article>;
    })}
  </div>;
}

function DbConversationPreviewDrawer({ detail, loading, workflowId, conversationId, onClose, onOpenDetail }) {
  const open = Boolean(detail || loading);
  return <Drawer className="db-conversation-preview-drawer" title={detail?.friendNick ? `查看对话 · ${detail.friendNick}` : '查看对话'} extra={<Button type="link" size="small" icon={<EyeOutlined />} disabled={loading || !workflowId || !conversationId} onClick={onOpenDetail}>查看详情</Button>} open={open} placement="right" width={560} onClose={onClose} destroyOnHidden styles={{ body: { padding: 0 } }}>
    <div className="db-conversation-preview-body"><Spin spinning={loading} tip="正在加载会话消息"><div className="db-conversation-preview-content">{detail ? <DbConversationTranscript detail={detail} /> : null}</div></Spin></div>
  </Drawer>;
}

function DbMessageTriggerIdBar({ triggerMessageId }) {
  const value = String(triggerMessageId || '').trim();
  if (!value) return null;
  const stopCardAction = event => event.stopPropagation();
  return <span className="db-message-trigger-id-row">
    <span className="db-message-trigger-id" title={value}>{value}</span>
    <span className="db-message-trigger-copy-zone" onClick={stopCardAction} onMouseDown={stopCardAction} onKeyDown={stopCardAction}>
      <Tooltip title="复制 triggerMessageId">
        <Button
          type="text"
          size="small"
          shape="circle"
          className="db-message-trigger-copy"
          icon={<CopyOutlined />}
          aria-label="复制 triggerMessageId"
          onClick={event => {
            stopCardAction(event);
            emitListToolbar('copy-trigger-message-id', { value });
          }}
        />
      </Tooltip>
    </span>
  </span>;
}

function DbConversationActionGroups({ actions }) {
  const actionGroups = [];
  const actionGroupMap = new Map();
  actions.forEach(action => {
    const actionType = action.actionType || action.actionLabel || 'other';
    if (!actionGroupMap.has(actionType)) {
      const group = { actionType, items: [] };
      actionGroupMap.set(actionType, group);
      actionGroups.push(group);
    }
    actionGroupMap.get(actionType).items.push(action);
  });
  if (!actionGroups.length) return null;
  return <span className="db-message-actions">
    {actionGroups.map(group => <span key={group.actionType} className={`db-message-action-group ${group.actionType}`}>
      {group.actionType === 'set_variable' ? <>
        <span className="db-message-action-label">设置变量</span>
        <span className="db-message-variable-table">
          {group.items.flatMap(action => Array.isArray(action.assignments) ? action.assignments : []).map((assignment, index) => <span key={`${assignment.key || 'variable'}-${index}`} className="db-message-variable-table-row"><span>{assignment.key || '-'}</span><span>{renderDbMessageText(assignment.value)}</span></span>)}
        </span>
      </> : group.actionType === 'tag' ? <>
        <span className="db-message-action-label">打标签</span>
        <span className="db-message-action-tag-list">
          {group.items.map(action => <Tag key={action.id} className="db-message-action-tag">{action.tagOperateType === 2 ? '-' : '+'}{renderDbMessageText(action.content)}</Tag>)}
        </span>
      </> : group.actionType === 'http_request' ? <>
        <span className="db-message-role">HTTP请求</span>
        <span className="db-message-action-http-list">
          {group.items.map(action => <span key={action.id || action.nodeId || action.nodeName} className="db-message-action db-message-action-http-row">{action.nodeName || action.actionLabel || 'HTTP请求'}</span>)}
        </span>
      </> : group.items.map(action => <span key={action.id || action.nodeId || action.nodeName} className="db-message-action db-message-action-http-row">{action.nodeName || action.actionLabel || 'HTTP请求'}</span>)}
    </span>)}
  </span>;
}

function DbMessageDrawer({ open, onClose, workflowId, conversationId, onSend, mqConfigs, lastUsedMqConfigId, configId }) {
  const [message, setMessage] = useState("");
  const [selectedMqConfigId, setSelectedMqConfigId] = useState("");
  const [sending, setSending] = useState(false);
  const [composerMode, setComposerMode] = useState('input');
  const [previewJson, setPreviewJson] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const mqConfigOptions = (Array.isArray(mqConfigs) ? mqConfigs : []).map(config => ({
    value: String(config.id),
    label: config.name || config.gatewayUrl || config.id
  }));

  useEffect(() => {
    const availableConfigIds = new Set(mqConfigOptions.map(config => config.value));
    const storedConfigId = String(window.localStorage?.getItem('db-conversation-last-mq-config-id') || '');
    const preferredConfigId = [String(lastUsedMqConfigId || ''), storedConfigId, mqConfigOptions[0]?.value]
      .find(configIdValue => availableConfigIds.has(configIdValue));
    setSelectedMqConfigId(currentConfigId => availableConfigIds.has(currentConfigId) ? currentConfigId : (preferredConfigId || ''));
  }, [open, lastUsedMqConfigId, mqConfigs]);

  const handleMqConfigChange = value => {
    const nextConfigId = String(value || '');
    setSelectedMqConfigId(nextConfigId);
    if (nextConfigId) window.localStorage?.setItem('db-conversation-last-mq-config-id', nextConfigId);
    else window.localStorage?.removeItem('db-conversation-last-mq-config-id');
  };

  const loadPreview = async () => {
    if (!message.trim()) return;
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        workflowId,
        conversationId,
        message: message.trim(),
        mqConfigId: selectedMqConfigId || ""
      });
      if (configId) params.set("configId", configId);
      const result = await api("/api/db/conversations/preview?" + params.toString());
      setPreviewJson(JSON.stringify(result.payload, null, 2));
    } catch (err) {
      setPreviewJson("// Error: " + err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const changeComposerMode = async mode => {
    setComposerMode(mode);
    if (mode === 'preview') await loadPreview();
  };

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    if (!mqConfigOptions.length) {
      window.showGlobalMessage?.('未配置 MQ，请前往系统设置完成 MQ 配置后再发送', 'warning');
      return;
    }
    if (!selectedMqConfigId) {
      window.showGlobalMessage?.('请选择 MQ 配置后再发送', 'warning');
      return;
    }
    setSending(true);
    try {
      const result = await onSend({
        message: message.trim(),
        mqConfigId: selectedMqConfigId,
        configId
      });
      if (!result?.success) {
        throw new Error(result?.snapshot?.mqResult?.error || result?.status || 'MQ 发送失败');
      }
      setMessage("");
      setComposerMode('input');
      window.localStorage?.setItem('db-conversation-last-mq-config-id', selectedMqConfigId);
      onClose();
      window.showGlobalMessage?.('消息已发送，等待处理结果', 'success');
    } catch (err) {
      window.showGlobalMessage?.(err?.message || 'MQ 发送失败', 'error');
    } finally {
      setSending(false);
    }
  };

  return <Drawer
    title="发送新消息"
    open={open}
    placement="right"
    width={480}
    onClose={onClose}
    destroyOnHidden={false}
    footer={<Flex justify="flex-end" gap={8}><Button onClick={onClose} disabled={sending}>取消</Button><Button type="primary" onClick={handleSend} disabled={!message.trim() || sending} loading={sending}>发送</Button></Flex>}
  >
    <div className="db-message-drawer-content">
      <div className="db-message-drawer-composer-header">
        <Text strong>学员消息</Text>
        <Space.Compact>
          <Button type={composerMode === 'input' ? 'primary' : 'default'} onClick={() => changeComposerMode('input')}>文本输入</Button>
          <Button type={composerMode === 'preview' ? 'primary' : 'default'} onClick={() => changeComposerMode('preview')} disabled={!message.trim()}>预览 JSON</Button>
        </Space.Compact>
      </div>
      {composerMode === 'input' ? <Input.TextArea
        className="db-message-drawer-textarea"
        value={message}
        onChange={event => setMessage(event.target.value)}
        placeholder="输入新的学员消息..."
        autoSize={{ minRows: 10, maxRows: 18 }}
        disabled={sending}
      /> :
        <Spin spinning={previewLoading}>
          <pre className="db-message-input-json"><code>{renderJsonPreviewCode(previewJson)}</code></pre>
        </Spin>
      }
      <div className="db-message-drawer-config">
        <Text strong>MQ 配置</Text>
        <Select
          className="db-message-drawer-config-select"
          placeholder={mqConfigOptions.length ? '选择 MQ 配置' : '暂无 MQ 配置'}
          options={mqConfigOptions}
          value={selectedMqConfigId || undefined}
          onChange={handleMqConfigChange}
          disabled={!mqConfigOptions.length || sending}
          allowClear
        />
      </div>
    </div>
  </Drawer>;
}
function formatDbMessageTime(value) {
  if (!value) return '';
  const timestamp = dayjs(value);
  if (!timestamp.isValid()) return String(value);
  return timestamp.format(timestamp.year() === dayjs().year() ? 'MM-DD HH:mm:ss' : 'YYYY-MM-DD HH:mm:ss');
}

function DbConversationDetailPage({ data }) {
  const detail = data.detail;
  const activeDbConfig = (data.configs || []).find(config => config.id === data.connection?.configId);
  const canSendMessage = activeDbConfig?.environment === 'test';
  const [drawerNode, setDrawerNode] = useState(null);
  const [messageOrder, setMessageOrder] = useState('asc');
  const [showActions, setShowActions] = useState(() => window.localStorage?.getItem('db-conversation-show-actions') === 'true');
  const [flowInstance, setFlowInstance] = useState(null);
  const [flowZoom, setFlowZoom] = useState(0.8);
  const [nodePositionOverrides, setNodePositionOverrides] = useState({});
  const [activeExecutionIndex, setActiveExecutionIndex] = useState(0);
  const flowPanelRef = useRef(null);
  const messageFlowRef = useRef(null);
  const historicalFocusNodeRef = useRef('');
  const [lastUsedMqConfigId, setLastUsedMqConfigId] = useState('');
  const [pendingMessages, setPendingMessages] = useState([]);
  const [pollingTriggerMessageIds, setPollingTriggerMessageIds] = useState([]);
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [pollUntil, setPollUntil] = useState(0);
  const [pollVersion, setPollVersion] = useState(0);
  const messageScrollKeyRef = useRef('');
  const pendingMessageFocusRef = useRef('');
  const pollInFlightRef = useRef(false);
  const hasPollableMessage = pollingTriggerMessageIds.length > 0;
  useEffect(() => {
    setNodePositionOverrides({});
    historicalFocusNodeRef.current = '';
    pollInFlightRef.current = false;
    setPollUntil(0);
    setPendingMessages([]);
    setPollingTriggerMessageIds([]);
  }, [data.activeWorkflowId, data.activeConversationId]);
  useEffect(() => {
    window.localStorage?.setItem('db-conversation-show-actions', String(showActions));
  }, [showActions]);
  useEffect(() => {
    setActiveExecutionIndex(0);
  }, [data.selectedTriggerMessageId, detail?.selectedTriggerMessageId]);
  useEffect(() => {
    const handleMessageAction = event => {
      if (event.detail?.type === 'open' && canSendMessage) {
        setMessageDrawerOpen(true);
        emitListToolbar('load-db-conversation-mq-configs');
      }
    };
    document.addEventListener('db-conversation-message-action', handleMessageAction);
    return () => document.removeEventListener('db-conversation-message-action', handleMessageAction);
  }, [canSendMessage]);
  useEffect(() => {
    if (!canSendMessage) setMessageDrawerOpen(false);
  }, [canSendMessage]);
  useEffect(() => {
    const persistedMessages = detail?.messages || [];
    setPendingMessages(previous => {
      const next = previous.filter(pending => !persistedMessages.some(message =>
        String(message.role || '').toUpperCase() === 'USER'
        && String(message.triggerMessageId || message.id || '') === pending.triggerMessageId
      ));
      return next.length === previous.length ? previous : next;
    });
    setPollingTriggerMessageIds(previous => {
      const next = previous.filter(triggerMessageId => {
        const message = persistedMessages.find(item =>
          String(item.role || '').toUpperCase() === 'USER'
          && String(item.triggerMessageId || item.id || '') === triggerMessageId
        );
        return !message || (message.processed === false || message.processing === true);
      });
      return next.length === previous.length ? previous : next;
    });
  }, [detail?.messages]);
  useEffect(() => {
    const selectedPending = pendingMessages.find(message => message.triggerMessageId === data.selectedTriggerMessageId);
    if (!selectedPending) return;
    const persistedMessage = (detail?.messages || []).find(message =>
      String(message.role || '').toUpperCase() === 'USER'
      && String(message.triggerMessageId || message.id || '') === selectedPending.triggerMessageId
    );
    const triggerMessageId = persistedMessage?.triggerMessageId || persistedMessage?.id;
    if (triggerMessageId && triggerMessageId !== data.selectedTriggerMessageId) {
      emitListToolbar('select-db-message', { triggerMessageId });
    }
  }, [data.selectedTriggerMessageId, detail?.messages, pendingMessages]);
  useEffect(() => {
    const triggerMessageId = pendingMessageFocusRef.current;
    const list = messageFlowRef.current;
    if (!triggerMessageId || !list) return undefined;
    const frame = requestAnimationFrame(() => {
      const item = [...list.querySelectorAll('[data-trigger-message-id]')]
        .find(element => element.dataset.triggerMessageId === triggerMessageId);
      if (!item) return;
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      pendingMessageFocusRef.current = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [data.selectedTriggerMessageId, detail?.messages, pendingMessages]);
  useEffect(() => {
    const handlePollFinished = event => {
      const { workflowId, conversationId, success } = event.detail || {};
      if (String(workflowId || '') !== String(data.activeWorkflowId || '') || String(conversationId || '') !== String(data.activeConversationId || '')) return;
      pollInFlightRef.current = false;
      if (!success) {
        setPollUntil(0);
        return;
      }
      setPollVersion(version => version + 1);
    };
    document.addEventListener('db-conversation-poll-finished', handlePollFinished);
    return () => document.removeEventListener('db-conversation-poll-finished', handlePollFinished);
  }, [data.activeWorkflowId, data.activeConversationId]);
  useEffect(() => {
    if (!pollUntil) return undefined;
    if (!hasPollableMessage || !data.activeWorkflowId || !data.activeConversationId) {
      setPollUntil(0);
      return undefined;
    }
    const remainingMs = pollUntil - Date.now();
    if (remainingMs <= 0) {
      setPollUntil(0);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      emitListToolbar('poll-db-conversation-detail', {
        workflowId: data.activeWorkflowId,
        conversationId: data.activeConversationId
      });
    }, Math.min(DB_CONVERSATION_POLL_INTERVAL_MS, remainingMs));
    return () => window.clearTimeout(timer);
  }, [data.activeWorkflowId, data.activeConversationId, detail, hasPollableMessage, pollUntil, pollVersion]);
  useEffect(() => {
    if (data.detailLoading || !detail || !messageFlowRef.current) return undefined;
    const key = `${data.activeWorkflowId}\n${data.activeConversationId}`;
    if (!key || messageScrollKeyRef.current === key) return undefined;
    messageScrollKeyRef.current = key;
    const frame = requestAnimationFrame(() => {
      const element = messageFlowRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [data.detailLoading, detail, data.activeWorkflowId, data.activeConversationId]);
  useEffect(() => {
    const nodeId = data.historicalFocusNodeId;
    if (!nodeId || nodeId === historicalFocusNodeRef.current || !flowInstance || !flowPanelRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      const node = flowInstance.getNode?.(nodeId);
      if (!node) return;
      historicalFocusNodeRef.current = nodeId;
      const panel = flowPanelRef.current;
      const zoom = flowZoom;
      flowInstance.setViewport({
        x: panel.clientWidth / 2 - (node.position.x + 105) * zoom,
        y: panel.clientHeight / 2 - (node.position.y + 60) * zoom,
        zoom
      }, { duration: 180 });
    });
    return () => cancelAnimationFrame(frame);
  }, [data.historicalFocusNodeId, flowInstance, detail, flowZoom]);
  
  const handleSendMessage = async ({ message, mqConfigId, configId }) => {
    const result = await api('/api/db/conversations/send', {
      method: 'POST',
      body: JSON.stringify({
        workflowId: data.activeWorkflowId,
        conversationId: data.activeConversationId,
        message,
        mqConfigId,
        configId: configId || data.connection?.configId || ''
      })
    });
    if (result.success) {
      setLastUsedMqConfigId(mqConfigId);
      const pendingTriggerMessageId = String(result.triggerMessageId || result.snapshot?.payload?.requestId || `pending_${Date.now()}`);
      const pendingMsg = {
        id: pendingTriggerMessageId,
        triggerMessageId: pendingTriggerMessageId,
        workflowId: data.activeWorkflowId,
        conversationId: data.activeConversationId,
        role: 'USER',
        processed: false,
        processing: false,
        hasReplyAction: false,
        content: message,
        contentType: 'TEXT',
        messageTimestamp: new Date().toLocaleString('zh-CN'),
        isPending: true
      };
      pendingMessageFocusRef.current = pendingTriggerMessageId;
      setPendingMessages(prev => [...prev, pendingMsg]);
      setPollingTriggerMessageIds(prev => prev.includes(pendingTriggerMessageId) ? prev : [...prev, pendingTriggerMessageId]);
      emitListToolbar('select-db-message', { triggerMessageId: pendingTriggerMessageId });
      setPollUntil(Date.now() + DB_CONVERSATION_POLL_TIMEOUT_MS);
    }
    return result;
  };
  
  // Handle refresh
  const handleRefresh = () => {
    emitListToolbar('load-db-conversation-detail', {
      workflowId: data.activeWorkflowId,
      conversationId: data.activeConversationId
    });
  };
  
  if (data.detailLoading) return <div className="db-record-detail-loading"><Spin description="正在加载会话详情" /></div>;
  if (!detail) return <div className="db-record-empty"><Text type="secondary">暂无详情</Text></div>;
  const persistedMessages = detail.messages || [];
  const messages = [
    ...persistedMessages,
    ...pendingMessages.filter(pending => !persistedMessages.some(message =>
      String(message.role || '').toUpperCase() === 'USER'
      && String(message.triggerMessageId || message.id || '') === pending.triggerMessageId
    ))
  ];
  const selectedTrigger = data.selectedTriggerMessageId || detail.selectedTriggerMessageId || '';
  const executions = detail.executionsByTrigger?.[selectedTrigger] || [];
  const executionStepIndex = Math.min(Math.max(activeExecutionIndex, 0), Math.max(executions.length - 1, 0));
  const activeExecution = executions[executionStepIndex] || null;
  const graph = detail.workflowGraph || { nodes: [], edges: [] };
  const messageGroups = groupDbConversationMessages(messages);
  const orderedMessageGroups = messageOrder === 'desc' ? [...messageGroups].reverse() : messageGroups;
  const currentRawNodes = graph.nodes || [];
  const historicalRuntime = detail.historicalNodesByTrigger?.[selectedTrigger] || { nodes: [], edges: [] };
  const historicalRawNodes = (historicalRuntime.nodes || []).map(item => ({ ...item.node, __historical: item }));
  const rawNodes = [...currentRawNodes, ...historicalRawNodes];
  const nodeById = new Map(rawNodes.map(node => [node.id, node]));
  const nodeNameById = new Map(rawNodes.map(node => [node.id, node.data?.label || node.id]));
  const executionMap = new Map(executions.map(item => [item.nodeId, item]));
  const errorTriggerMessageIds = new Set(Object.entries(detail.executionsByTrigger || {})
    .filter(([, triggerExecutions]) => triggerExecutions.some(execution => isDbExecutionFailure(execution.status) || execution.errorMessage || execution.errorClass || execution.errorCode))
    .map(([triggerMessageId]) => triggerMessageId));
  const rawMinX = currentRawNodes.length ? Math.min(...currentRawNodes.map(node => Number(node.position?.x || 0))) : 0;
  const rawMinY = currentRawNodes.length ? Math.min(...currentRawNodes.map(node => Number(node.position?.y || 0))) : 0;
  const normalizedPosition = node => ({
    x: Number(node.position?.x || 0) - rawMinX + 48,
    y: Number(node.position?.y || 0) - rawMinY + 48
  });
  const initialPositions = new Map(currentRawNodes.map(node => [node.id, normalizedPosition(node)]));
  historicalRawNodes.forEach(node => {
    const connectedCurrentPositions = (historicalRuntime.edges || [])
      .filter(edge => edge.source === node.id || edge.target === node.id)
      .map(edge => initialPositions.get(edge.source === node.id ? edge.target : edge.source))
      .filter(Boolean);
    const initialPosition = connectedCurrentPositions.length
      ? {
        x: connectedCurrentPositions.reduce((sum, position) => sum + position.x, 0) / connectedCurrentPositions.length,
        y: connectedCurrentPositions.reduce((sum, position) => sum + position.y, 0) / connectedCurrentPositions.length
      }
      : normalizedPosition(node);
    initialPositions.set(node.id, initialPosition);
  });
  const graphNodes = rawNodes.map(node => {
    const execution = executionMap.get(node.id);
    const nodeType = dbNodeTypeOf(node, execution);
    const status = execution ? isDbExecutionSuccess(execution.status) ? 'success' : 'failed' : 'idle';
    const initialPosition = initialPositions.get(node.id) || normalizedPosition(node);
    return {
      id: node.id,
      type: 'dbWorkflow',
      position: nodePositionOverrides[node.id] || initialPosition,
      data: {
        rawNode: node,
        execution,
        activeStep: Boolean(activeExecution && execution?.id === activeExecution.id),
        legacyState: node.__historical?.state || '',
        label: node.data?.label || execution?.nodeName || node.id,
        nodeType,
        status,
        summary: dbNodeSummary({ ...node, type: nodeType, execution })
      }
    };
  });
  const executedNodes = new Set(executions.map(item => item.nodeId));
  const currentGraphEdges = (graph.edges || []).map(edge => {
    const active = executedNodes.has(edge.source) && executedNodes.has(edge.target);
    const label = dbEdgeLabel(edge, nodeById);
    return {
      id: edge.id || `${edge.source}-${edge.sourceHandle || 'out'}-${edge.target}-${edge.targetHandle || 'in'}`,
      source: edge.source,
      target: edge.target,
      label,
      animated: active,
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? '#10b981' : '#94a3b8' },
      className: active ? 'db-flow-edge active' : 'db-flow-edge idle',
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 4,
      labelStyle: { fill: active ? '#047857' : '#64748b', fontSize: 11, fontWeight: 600 },
      style: { stroke: active ? '#10b981' : '#94a3b8', strokeWidth: active ? 2.5 : 1.5 }
    };
  });
  const historicalGraphEdges = (historicalRuntime.edges || []).map(edge => {
    const active = executedNodes.has(edge.source) && executedNodes.has(edge.target);
    const label = edge.label || dbEdgeLabel(edge, nodeById);
    return {
      id: edge.id || `historical:${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      label,
      animated: active,
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? '#d97706' : '#f59e0b' },
      className: active ? 'db-flow-edge historical active' : 'db-flow-edge historical idle',
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 4,
      labelStyle: { fill: '#92400e', fontSize: 11, fontWeight: 600 },
      style: { stroke: active ? '#d97706' : '#f59e0b', strokeWidth: active ? 2.25 : 1.5, strokeDasharray: '6 4' }
    };
  });
  const graphEdges = [...currentGraphEdges, ...historicalGraphEdges];
  const labeledEdgesByPair = new Map();
  graphEdges.forEach(edge => {
    if (!edge.label) return;
    const key = `${edge.source}\n${edge.target}`;
    if (!labeledEdgesByPair.has(key)) labeledEdgesByPair.set(key, []);
    labeledEdgesByPair.get(key).push(edge.id);
  });
  const graphEdgesWithLabels = graphEdges.map(edge => {
    const labelIds = labeledEdgesByPair.get(`${edge.source}\n${edge.target}`) || [];
    const labelIndex = labelIds.indexOf(edge.id);
    return {
      ...edge,
      type: 'dbWorkflowEdge',
      label: edge.label || '',
      data: {
        active: String(edge.className || '').includes('active'),
        historical: String(edge.className || '').includes('historical'),
        labelOffset: labelIndex >= 0 ? (labelIndex - (labelIds.length - 1) / 2) * 22 : 0
      }
    };
  });
  const positionFlowAtFirstNode = (instance, zoom, duration = 0) => {
    const firstNode = graphNodes[0];
    const panel = flowPanelRef.current;
    if (!instance || !firstNode || !panel) return;
    const nodeElement = [...panel.querySelectorAll('.react-flow__node')].find(element => element.dataset.id === firstNode.id);
    const nodeHeight = nodeElement?.getBoundingClientRect().height || 140;
    instance.setViewport({
      x: 24 - firstNode.position.x * zoom,
      y: (panel.clientHeight - nodeHeight * zoom) / 2 - firstNode.position.y * zoom,
      zoom
    }, { duration });
    setFlowZoom(zoom);
  };
  const fitFlowViewport = () => flowInstance?.fitView({ padding: 0.18, duration: 180 });
  const resetNodePositions = () => {
    setNodePositionOverrides({});
    requestAnimationFrame(() => positionFlowAtFirstNode(flowInstance, 0.8, 180));
  };
  const focusExecutionStep = index => {
    if (!executions.length) return;
    const nextIndex = Math.min(Math.max(index, 0), executions.length - 1);
    const execution = executions[nextIndex];
    const node = graphNodes.find(item => item.id === execution.nodeId);
    setActiveExecutionIndex(nextIndex);
    if (!node) {
      emitListToolbar('load-db-historical-node', {
        workflowId: data.activeWorkflowId,
        triggerMessageId: selectedTrigger,
        nodeId: execution.nodeId
      });
      return;
    }
    if (!flowInstance || !flowPanelRef.current) return;
    const panel = flowPanelRef.current;
    const zoom = flowZoom;
    flowInstance.setViewport({
      x: panel.clientWidth / 2 - (node.position.x + 105) * zoom,
      y: panel.clientHeight / 2 - (node.position.y + 60) * zoom,
      zoom
    }, { duration: 180 });
  };
  const executionMenuItems = executions.map((execution, index) => {
    const meta = dbNodeMeta(execution.nodeType);
    const succeeded = isDbExecutionSuccess(execution.status);
    return {
    key: String(index),
    className: index === executionStepIndex ? 'db-flow-step-menu-option-selected' : '',
    label: <span className={`db-flow-step-menu-item ${succeeded ? 'success' : 'failed'}`} title={execution.nodeName || execution.nodeId || '未命名节点'}><Tag className="db-flow-step-menu-type" color={meta.color}>{meta.name}</Tag><span className="db-flow-step-menu-name">{execution.nodeName || execution.nodeId || '未命名节点'}</span><span className="db-flow-step-menu-duration">{execution.durationMs || 0}ms</span></span>
    };
  });
  const executionProgress = executions.length ? ((executionStepIndex + 1) / executions.length) * 100 : 0;
  const handleNodeChanges = changes => {
    const positionChanges = changes.filter(change => change.type === 'position' && change.position && change.dragging === false);
    if (!positionChanges.length) return;
    setNodePositionOverrides(previous => {
      const next = { ...previous };
      positionChanges.forEach(change => {
        next[change.id] = change.position;
      });
      return next;
    });
  };
  return <div className="db-record-detail-page">
    <div className="db-record-detail-layout">
      <aside className="db-message-flow">
        <div className="db-message-flow-toolbar">
          <Space size={4} align="center"><span className="db-message-flow-title">消息记录</span><Button type="link" size="small" onClick={() => emitListToolbar('open-db-conversation-variables', { workflowId: data.activeWorkflowId, conversationId: data.activeConversationId })}>会话变量</Button><span className="db-message-action-switch"><span>展示动作</span><Switch size="small" checked={showActions} onChange={setShowActions} /></span></Space>
          <Space size={8} align="center">
            <Tooltip title="刷新消息"><Button className="db-message-sort-button" type="text" shape="circle" size="small" icon={<ReloadOutlined />} aria-label="刷新消息" onClick={handleRefresh} /></Tooltip>
            <Tooltip title={messageOrder === 'asc' ? '切换为倒序' : '切换为正序'}><Button className="db-message-sort-button" type="text" shape="circle" size="small" icon={messageOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />} aria-label={messageOrder === 'asc' ? '切换为倒序' : '切换为正序'} onClick={() => setMessageOrder(order => order === 'asc' ? 'desc' : 'asc')} /></Tooltip>
          </Space>
        </div>
        <div ref={messageFlowRef} className="db-message-flow-list">
          {orderedMessageGroups.map(group => {
          const selected = group.triggerMessageId === selectedTrigger;
          const hasError = errorTriggerMessageIds.has(group.triggerMessageId);
          const userMessage = group.user || group.assistant;
          const assistantMessage = group.assistant;
          const processing = userMessage?.processing === true;
          const pending = !processing && (userMessage?.isPending === true || userMessage?.processed === false);
          const noReply = !hasError && !pending && !processing && !userMessage?.failed && userMessage?.hasReplyAction === false;
          const isPending = userMessage?.isPending === true;
          const conversationType = Number(userMessage?.conversationType) || 0;
          const isEventMessage = conversationType === 3;
          const chatRoomName = String(userMessage?.chatRoomName || '').trim();
          const selectMessage = () => emitListToolbar('select-db-message', { triggerMessageId: group.triggerMessageId });
          const shouldSkipCardSelect = event => event.target?.closest?.('.db-message-trigger-copy-zone');
          return <div
            key={group.triggerMessageId}
            role="button"
            tabIndex={0}
            data-trigger-message-id={group.triggerMessageId}
            className={`db-message-item conversation ${selected ? 'selected' : ''} ${isPending ? 'pending' : ''}`}
            onClick={event => {
              if (shouldSkipCardSelect(event)) return;
              selectMessage();
            }}
            onKeyDown={event => {
              if (shouldSkipCardSelect(event)) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              selectMessage();
            }}
          >
            {showActions ? <DbMessageTriggerIdBar triggerMessageId={group.triggerMessageId} /> : null}
            <span className="db-message-section">
              {conversationType === 2 && chatRoomName ? <span className="db-message-chat-room"><Tag color="purple">群-{chatRoomName}</Tag></span> : null}
              <span className="db-message-meta"><span className={`db-message-role${isEventMessage ? ' event-message' : ''}`}>{isEventMessage ? '事件消息' : (detail.friendNick || '学员消息')}</span><span className="db-message-time">{formatDbMessageTime(userMessage?.messageTimestamp)}</span>{pending || processing || noReply || hasError ? <span className="db-message-status-tags">{pending ? <Tag color="gold">待处理</Tag> : null}{processing ? <Tag className="db-message-processing-tag" color="blue">处理中</Tag> : null}{noReply ? <Tag color="default">不回复</Tag> : null}{hasError ? <Tag color="red">有错误</Tag> : null}</span> : null}</span>
              <span className="db-message-content">{renderDbMessageText(userMessage?.content)}</span>
            </span>
            {showActions ? <DbConversationActionGroups actions={group.actions} /> : null}
            {assistantMessage && !noReply ? <span className="db-message-ai-reply">
              <span className="db-message-meta"><span className="db-message-role">AI回复</span>{assistantMessage?.messageTimestamp ? <span className="db-message-time">{formatDbMessageTime(assistantMessage.messageTimestamp)}</span> : null}</span>
              <span className="db-message-content">{assistantMessage?.content === '' ? '\u00a0' : renderDbMessageText(assistantMessage?.content)}</span>
            </span> : null}
          </div>;
          })}
        </div>
        {canSendMessage ? <div className="db-message-flow-footer">
          <Button type="primary" icon={<SendOutlined />} block onClick={() => emitDbConversationMessageAction('open')}>发送新消息</Button>
        </div> : null}
      </aside>
      <section ref={flowPanelRef} className="db-flow-panel">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdgesWithLabels}
          nodeTypes={dbWorkflowNodeTypes}
          edgeTypes={dbWorkflowEdgeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          minZoom={0.05}
          maxZoom={1.6}
          nodesDraggable
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          onInit={instance => {
            setFlowInstance(instance);
            requestAnimationFrame(() => requestAnimationFrame(() => positionFlowAtFirstNode(instance, 0.8)));
          }}
          onMove={(_, viewport) => setFlowZoom(viewport.zoom)}
          onNodesChange={handleNodeChanges}
          onNodeClick={(_, node) => {
            const execution = node.data?.execution;
            const executionDetails = execution?.id ? data.nodeExecutionDetails?.[execution.id] : null;
            setDrawerNode({
              ...(execution || { nodeId: node.id, nodeName: node.data?.label, nodeType: node.data?.nodeType, status: '未执行' }),
              ...(executionDetails || {}),
              nodeConfig: node.data?.rawNode?.data?.config ?? node.data?.rawNode?.data ?? null
            });
            if (execution?.id && !executionDetails) {
              emitListToolbar('load-db-node-execution', {
                workflowId: data.activeWorkflowId,
                triggerMessageId: execution.triggerMessageId || selectedTrigger,
                executionId: execution.id
              });
            }
          }}
        >
          <Background color="#5b73a6" gap={22} size={1} />
        </ReactFlow>
        <div className="db-flow-zoom-controls">
          <Tooltip title="适应画布"><Button size="small" icon={<FullscreenOutlined />} aria-label="适应画布" onClick={fitFlowViewport} /></Tooltip>
          <Tooltip title="重置节点位置"><Button size="small" icon={<ReloadOutlined />} aria-label="重置节点位置" onClick={resetNodePositions} /></Tooltip>
          <span className="db-flow-zoom-value">{Math.round(flowZoom * 100)}%</span>
        </div>
        {activeExecution ? <div className="db-flow-step-controls">
          <div className="db-flow-step-progress"><span style={{ width: `${executionProgress}%` }} /></div>
          <div className="db-flow-step-content">
            <Dropdown menu={{ items: executionMenuItems, selectedKeys: [String(executionStepIndex)], onClick: ({ key }) => focusExecutionStep(Number(key)) }} trigger={['hover']}><Tooltip title="选择执行节点"><Button className="db-flow-step-menu-button" icon={<UnorderedListOutlined />} aria-label="选择执行节点" /></Tooltip></Dropdown>
            <Tag className="db-flow-step-type" color={dbNodeMeta(activeExecution.nodeType).color}>{dbNodeMeta(activeExecution.nodeType).name}</Tag>
            <span className="db-flow-step-name" title={activeExecution.nodeName || activeExecution.nodeId}>{activeExecution.nodeName || activeExecution.nodeId || '未命名节点'}</span>
            <span className="db-flow-step-duration">{activeExecution.durationMs || 0}ms</span>
            <span className="db-flow-step-actions">
              <Tooltip title="重新开始"><Button icon={<ReloadOutlined />} aria-label="重新开始" onClick={() => focusExecutionStep(0)} /></Tooltip>
              <Tooltip title="上一节点"><Button icon={<StepBackwardOutlined />} aria-label="上一节点" disabled={executionStepIndex === 0} onClick={() => focusExecutionStep(executionStepIndex - 1)} /></Tooltip>
              <Tooltip title="下一节点"><Button icon={<StepForwardOutlined />} aria-label="下一节点" disabled={executionStepIndex === executions.length - 1} onClick={() => focusExecutionStep(executionStepIndex + 1)} /></Tooltip>
            </span>
          </div>
        </div> : null}
      </section>
    </div>
    <DbNodeDrawer node={drawerNode?.id && data.nodeExecutionDetails?.[drawerNode.id] ? { ...drawerNode, ...data.nodeExecutionDetails[drawerNode.id] } : drawerNode} loading={data.nodeExecutionLoadingId === drawerNode?.id} onClose={() => setDrawerNode(null)} nodeNameById={nodeNameById} scenarios={data.scenarios} userTags={data.userTags} />
    {canSendMessage ? <DbMessageDrawer open={messageDrawerOpen} onClose={() => setMessageDrawerOpen(false)} workflowId={data.activeWorkflowId} conversationId={data.activeConversationId} onSend={handleSendMessage} mqConfigs={data.mqConfigs} lastUsedMqConfigId={lastUsedMqConfigId} configId={data.connection?.configId} /> : null}
  </div>;
}

function DbConversationVariablesModal({ data }) {
  const columns = [
    { title: '变量名', dataIndex: 'key', width: 220, render: value => <Text>{value || '-'}</Text> },
    { title: '变量值', dataIndex: 'value', render: value => <span className="db-variable-value">{renderDbVariableValue(value)}</span> },
    { title: '类型', dataIndex: 'type', width: 130, render: value => <Text type="secondary">{value || '-'}</Text> },
    { title: '描述', dataIndex: 'description', width: 220, render: value => <span className="db-variable-description">{value || '-'}</span> }
  ];
  return <Modal open={data.variablesOpen} title="会话变量最终状态" width={920} footer={<Button onClick={() => emitListToolbar('close-db-conversation-variables')}>关闭</Button>} onCancel={() => emitListToolbar('close-db-conversation-variables')} destroyOnHidden>
    <Table className="db-conversation-variables-table" rowKey="key" size="small" columns={columns} dataSource={data.variables || []} loading={data.variablesLoading} pagination={false} scroll={{ y: 480 }} locale={{ emptyText: '暂无会话变量' }} />
  </Modal>;
}

function DbRecordsPage({ data }) {
  // 抽屉和弹窗通过 portal 挂在 body，离开会话页时必须卸载，不能只隐藏页面容器。
  if (!data.active) return null;
  return <>{data.page === 'detail' ? <DbConversationDetailPage data={data} /> : <DbConversationListPage data={data} />}<DbConversationVariablesModal data={data} /></>;
}

function formatAnalyticsDuration(ms) {
  const num = Number(ms);
  if (!Number.isFinite(num) || num < 0) return '-';
  if (num < 1000) return `${Math.round(num)} ms`;
  if (num < 60000) return `${(num / 1000).toFixed(2)} s`;
  const minutes = Math.floor(num / 60000);
  const seconds = ((num % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function analyticsErrorRateLevel(rate) {
  const num = Number(rate) || 0;
  if (num <= 0) return 'healthy';
  if (num < 5) return 'warning';
  return 'danger';
}

const DbAnalyticsSkeletonTriggerNode = memo(function DbAnalyticsSkeletonTriggerNode({ data }) {
  const rate = Math.min(100, Math.max(0, Number(data.triggerHitRate) || 100));
  return <div className="db-skel-node trigger">
    <div className="db-skel-card-head">
      <div className="db-skel-head-main">
        <span className="db-skel-badge trigger"><ThunderboltOutlined /> 触发入口 · L0</span>
        <span className="db-skel-title" title={data.nodeName}>{data.nodeName}</span>
      </div>
    </div>
    <div className="db-skel-trigger-body">
      <div className="db-skel-trigger-metric">
        <span>触发命中轮次</span>
        <strong>{data.triggerHitCount || 0} 轮 ({rate}%)</strong>
      </div>
      <div className="db-skel-bar-track">
        <div className="db-skel-bar-fill trigger" style={{ width: `${rate}%` }} />
      </div>
    </div>
    <Handle id="trigger-out" type="source" position={Position.Right} className="db-skel-handle out active" />
  </div>;
});

const DbAnalyticsSkeletonConditionNode = memo(function DbAnalyticsSkeletonConditionNode({ data }) {
  const branches = Array.isArray(data.branches) ? data.branches : [];
  return <div className={`db-skel-node condition${data.isHistorical ? ' historical' : ''}`}>
    <Handle id="cond-in" type="target" position={Position.Left} className="db-skel-handle in" />
    <div className="db-skel-card-head">
      <div className="db-skel-head-main">
        <span className="db-skel-badge condition">L{data.level || 1} 分流</span>
        <span className="db-skel-title" title={data.nodeName}>{data.nodeName}</span>
        {data.isHistorical ? <Tag color="gold" bordered={false}>历史</Tag> : null}
      </div>
      <Tooltip title="忽略此条件节点（自动折叠并直连下游分流）">
        <button
          type="button"
          className="db-skel-ignore-btn nodrag nopan"
          onClick={event => {
            event.stopPropagation();
            data.onIgnore?.(data.nodeId);
          }}
        >
          忽略
        </button>
      </Tooltip>
    </div>
    <div className="db-skel-card-sub">
      <span>共执行 <strong>{data.executionCount || 0}</strong> 次</span>
      <span>轮次命中 <strong>{data.triggerHitRate || 0}%</strong> ({data.triggerCount || 0} 轮)</span>
    </div>
    <div className="db-skel-branch-list">
      {branches.map(branch => {
        const rate = Math.min(100, Math.max(0, Number(branch.branchRate) || 0));
        const isDominant = rate >= 50 && (branch.hitCount || 0) > 0;
        const isZero = (branch.hitCount || 0) <= 0;
        const downstreamList = Array.isArray(branch.downstreamConditions) ? branch.downstreamConditions : [];
        const hasDownstream = downstreamList.length > 0;
        const maxViaCount = hasDownstream ? Math.max(0, ...downstreamList.map(d => Number(d.viaCount) || 0)) : 0;
        const viaTooltip = (branch.viaNodes || []).length
          ? `途经 ${branch.viaNodes.length} 个普通节点：${branch.viaNodes.map(v => v.nodeName).join(' → ')}`
          : undefined;
        return <div
          key={branch.branchKey}
          className={`db-skel-branch-row${isDominant ? ' dominant' : ''}${isZero ? ' zero' : ''}`}
        >
          <div className="db-skel-branch-top">
            <span className="db-skel-branch-name" title={branch.branchName}>
              {branch.branchName}
              {branch.isDefault ? <small className="db-skel-default-pill">默认</small> : null}
            </span>
            <span className="db-skel-branch-nums">
              <strong>{branch.hitCount || 0} 次</strong>
              <span>({branch.branchRate || 0}%)</span>
            </span>
          </div>
          <div className="db-skel-bar-track">
            <div
              className={`db-skel-bar-fill ${isDominant ? 'dominant' : isZero ? 'zero' : 'normal'}`}
              style={{ width: `${isZero ? 0 : Math.max(3, rate)}%` }}
            />
          </div>
          <div className="db-skel-branch-dest">
            {hasDownstream ? (
              <span className="db-skel-dest-link" title={downstreamList.map(d => d.nodeName).join('、')}>
                ↳ 流向：{downstreamList.map(d => d.nodeName).join('、')}
                {maxViaCount > 0 ? ` · 经 ${maxViaCount} 节点` : ''}
              </span>
            ) : (
              <Tooltip title={viaTooltip}>
                <span className={`db-skel-dest-terminal${branch.hasReplySend ? ' reply' : ''}`}>
                  {branch.hasReplySend
                    ? `→ AI回复/发送消息${branch.viaCount > 0 ? ` (经 ${branch.viaCount} 节点)` : ''}`
                    : branch.viaCount > 0
                      ? `→ 途经 ${branch.viaCount} 个节点后结束`
                      : '→ 流程结束'}
                </span>
              </Tooltip>
            )}
          </div>
          <Handle
            id={String(branch.branchKey)}
            type="source"
            position={Position.Right}
            className={`db-skel-handle branch-out ${hasDownstream ? 'active' : 'inactive'}`}
          />
        </div>;
      })}
    </div>
  </div>;
});

function DbAnalyticsSkeletonEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, style, className, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });
  const labelOffset = Number(data?.labelOffset || 0);
  const viaNodes = Array.isArray(data?.viaNodes) ? data.viaNodes : [];
  const viaCount = Number(data?.viaCount || viaNodes.length || 0);
  const viaTitle = viaCount > 0
    ? `已折叠中间 ${viaCount} 个节点：${viaNodes.map((v, idx) => `${idx + 1}. ${v.nodeName}`).join(' → ')}`
    : '';
  return <>
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} className={className} />
    <EdgeLabelRenderer>
      <div
        className={`db-skel-edge-pill nodrag nopan${data?.isDominant ? ' dominant' : ''}${data?.isZero ? ' zero' : ''}${data?.edgeKind === 'trigger' ? ' trigger' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffset}px)` }}
      >
        <div className="db-skel-edge-main">
          {data?.edgeKind === 'trigger'
            ? `流入 ${data?.hitCount || 0} 轮 (${data?.rate || 0}%)`
            : `${data?.branchName || '分支'}: ${data?.hitCount || 0} 次 (${data?.rate || 0}%)`}
        </div>
        {viaCount > 0 ? (
          <Tooltip title={viaTitle}>
            <div className="db-skel-edge-via">途经 {viaCount} 个节点</div>
          </Tooltip>
        ) : null}
      </div>
    </EdgeLabelRenderer>
  </>;
}

const dbAnalyticsSkeletonNodeTypes = {
  analyticsTrigger: DbAnalyticsSkeletonTriggerNode,
  analyticsCondition: DbAnalyticsSkeletonConditionNode
};

const dbAnalyticsSkeletonEdgeTypes = {
  analyticsSkeletonEdge: DbAnalyticsSkeletonEdge
};

function buildConditionSkeletonModel({ flowGraph, conditionNodes, allNodes, ignoredConditionSet, onIgnore }) {
  const graphNodes = Array.isArray(flowGraph?.nodes) ? flowGraph.nodes : [];
  const graphEdges = Array.isArray(flowGraph?.edges) ? flowGraph.edges : [];
  const allNodesList = Array.isArray(allNodes) ? allNodes : [];
  const rawConditions = Array.isArray(conditionNodes) ? conditionNodes : [];

  const nodeMetaById = new Map();
  allNodesList.forEach(item => {
    nodeMetaById.set(String(item.nodeId), {
      nodeId: String(item.nodeId),
      nodeName: item.nodeName || String(item.nodeId),
      nodeType: item.nodeType || 'unknown',
      executionCount: Number(item.executionCount || 0),
      triggerHitCount: Number(item.triggerHitCount ?? item.triggerCount ?? 0),
      triggerHitRate: Number(item.triggerHitRate || 0),
      position: { x: 0, y: 0 }
    });
  });
  graphNodes.forEach(item => {
    const id = String(item.nodeId || item.id || '');
    if (!id) return;
    const prev = nodeMetaById.get(id) || {};
    nodeMetaById.set(id, {
      ...prev,
      nodeId: id,
      nodeName: item.nodeName || prev.nodeName || id,
      nodeType: item.nodeType || prev.nodeType || 'unknown',
      executionCount: Number(item.executionCount ?? prev.executionCount ?? 0),
      triggerHitCount: Number(item.triggerHitCount ?? item.triggerCount ?? prev.triggerHitCount ?? 0),
      triggerHitRate: Number(item.triggerHitRate ?? prev.triggerHitRate ?? 0),
      position: item.position || prev.position || { x: 0, y: 0 }
    });
  });

  const activeConditions = rawConditions
    .filter(c => !ignoredConditionSet.has(String(c.nodeId)))
    .map(c => ({
      ...c,
      nodeId: String(c.nodeId),
      branches: (c.branches || []).map(b => ({ ...b }))
    }));
  const activeConditionById = new Map(activeConditions.map(c => [c.nodeId, c]));

  const outgoingBySource = new Map();
  graphEdges.forEach(edge => {
    const source = String(edge?.source || '');
    const target = String(edge?.target || '');
    if (!source || !target) return;
    if (!outgoingBySource.has(source)) outgoingBySource.set(source, []);
    outgoingBySource.get(source).push({ ...edge, source, target });
  });

  const traceToActiveConditions = startTargets => {
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
      if (activeConditionById.has(targetId)) {
        if (!seenConditionIds.has(targetId)) {
          seenConditionIds.add(targetId);
          const cond = activeConditionById.get(targetId);
          downstreamConditions.push({
            nodeId: targetId,
            nodeName: cond.nodeName,
            viaCount: 0,
            viaNodes: []
          });
        }
      } else if (!visited.has(targetId)) {
        visited.add(targetId);
        const meta = nodeMetaById.get(targetId) || {
          nodeId: targetId,
          nodeName: target.nodeName || targetId,
          nodeType: target.nodeType || 'unknown'
        };
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
      const nextEdges = outgoingBySource.get(currentId) || [];
      if (!nextEdges.length) {
        const lastMeta = nodeMetaById.get(currentId);
        if (lastMeta?.nodeType) terminalNodeTypes.add(lastMeta.nodeType);
      }
      nextEdges.forEach(edge => {
        const nextId = edge.target;
        if (!nextId) return;
        if (activeConditionById.has(nextId)) {
          if (!seenConditionIds.has(nextId)) {
            seenConditionIds.add(nextId);
            const cond = activeConditionById.get(nextId);
            downstreamConditions.push({
              nodeId: nextId,
              nodeName: cond.nodeName,
              viaCount: viaNodes.length,
              viaNodes
            });
          }
        } else if (!visited.has(nextId)) {
          visited.add(nextId);
          const nextMeta = nodeMetaById.get(nextId) || { nodeId: nextId, nodeName: nextId, nodeType: 'unknown' };
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

  const triggerNodes = graphNodes
    .filter(n => n.nodeType === 'lingxi_trigger')
    .map(n => nodeMetaById.get(String(n.nodeId || n.id)) || n);
  if (!triggerNodes.length) {
    allNodesList
      .filter(n => n.nodeType === 'lingxi_trigger')
      .forEach(n => triggerNodes.push(nodeMetaById.get(String(n.nodeId)) || n));
  }

  const skeletonEdges = [];
  const upstreamByConditionId = new Map(activeConditions.map(c => [c.nodeId, []]));

  triggerNodes.forEach(trig => {
    const trigId = String(trig.nodeId);
    const directTargets = (outgoingBySource.get(trigId) || []).map(e => nodeMetaById.get(e.target) || { nodeId: e.target, nodeName: e.target });
    const traced = traceToActiveConditions(directTargets);
    traced.downstreamConditions.forEach(dc => {
      const targetCond = activeConditionById.get(dc.nodeId);
      const hitCount = targetCond?.triggerCount || targetCond?.executionCount || 0;
      const rate = targetCond?.triggerHitRate || 0;
      upstreamByConditionId.get(dc.nodeId)?.push({
        sourceType: 'trigger',
        nodeId: trigId,
        nodeName: trig.nodeName,
        branchKey: '',
        branchName: '',
        hitCount,
        rate,
        viaCount: dc.viaCount,
        viaNodes: dc.viaNodes
      });
      skeletonEdges.push({
        id: `skel-trig-${trigId}->${dc.nodeId}`,
        source: trigId,
        sourceHandle: 'trigger-out',
        target: dc.nodeId,
        targetHandle: 'cond-in',
        edgeKind: 'trigger',
        branchName: '触发流入',
        hitCount,
        rate,
        viaCount: dc.viaCount,
        viaNodes: dc.viaNodes
      });
    });
  });

  activeConditions.forEach(condNode => {
    const condOutgoing = outgoingBySource.get(condNode.nodeId) || [];
    const claimedTargetIds = new Set();
    condNode.branches.forEach(branch => {
      (branch.targetNodes || []).forEach(t => {
        if (t?.nodeId) claimedTargetIds.add(String(t.nodeId));
      });
    });
    if (condOutgoing.length && condNode.branches.length) {
      const unclaimedTargets = condOutgoing
        .map(e => String(e.target || '').trim())
        .filter(tid => tid && !claimedTargetIds.has(tid));
      if (unclaimedTargets.length) {
        const validBranches = condNode.branches.filter(b => b.branchKey !== '__unmatched__');
        const candidateBranches = validBranches.length ? validBranches : condNode.branches;
        const emptyBranches = candidateBranches.filter(b => !(b.targetNodes || []).length);
        const primaryBranch = [...candidateBranches].sort((a, b) => ((b.hitCount || 0) - (a.hitCount || 0)) || (Number(a.isDefault) - Number(b.isDefault)))[0];
        unclaimedTargets.forEach((tid, idx) => {
          if (claimedTargetIds.has(tid)) return;
          claimedTargetIds.add(tid);
          const targetBranch = emptyBranches[idx] || primaryBranch;
          const meta = nodeMetaById.get(tid) || { nodeId: tid, nodeName: tid, nodeType: 'unknown' };
          targetBranch.targetNodes = [...(targetBranch.targetNodes || []), { nodeId: meta.nodeId, nodeName: meta.nodeName, nodeType: meta.nodeType }];
        });
      }
    }

    condNode.branches.forEach((branch, branchIdx) => {
      const traced = traceToActiveConditions(branch.targetNodes || []);
      branch.downstreamConditions = traced.downstreamConditions;
      branch.hasDownstreamCondition = traced.downstreamConditions.length > 0;
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
          branchIdx,
          hitCount: branch.hitCount || 0,
          rate: branch.branchRate || 0,
          viaCount: dc.viaCount,
          viaNodes: dc.viaNodes
        });
        skeletonEdges.push({
          id: `skel-branch-${condNode.nodeId}:${branch.branchKey}->${dc.nodeId}`,
          source: condNode.nodeId,
          sourceHandle: String(branch.branchKey),
          target: dc.nodeId,
          targetHandle: 'cond-in',
          edgeKind: 'branch',
          branchKey: branch.branchKey,
          branchName: branch.branchName,
          branchIdx,
          hitCount: branch.hitCount || 0,
          rate: branch.branchRate || 0,
          workflowRate: branch.workflowRate || 0,
          viaCount: dc.viaCount,
          viaNodes: dc.viaNodes
        });
      });
    });
  });

  const distFromTrigger = new Map();
  const bfsQueue = [];
  triggerNodes.forEach(trig => {
    const trigId = String(trig.nodeId);
    distFromTrigger.set(trigId, 0);
    bfsQueue.push(trigId);
  });
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift();
    const d = distFromTrigger.get(curr) || 0;
    (outgoingBySource.get(curr) || []).forEach(edge => {
      if (edge.target && !distFromTrigger.has(edge.target)) {
        distFromTrigger.set(edge.target, d + 1);
        bfsQueue.push(edge.target);
      }
    });
  }

  const condOutMap = new Map(activeConditions.map(c => [c.nodeId, new Set()]));
  activeConditions.forEach(c => {
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

  const getCondPosX = nodeId => {
    const c = activeConditionById.get(nodeId);
    const meta = nodeMetaById.get(nodeId);
    return Number(c?.position?.x || meta?.position?.x || 0);
  };

  const getCondHits = nodeId => {
    const c = activeConditionById.get(nodeId);
    return Number(c?.triggerCount ?? c?.executionCount ?? 0);
  };

  const isPriorCondition = (aId, bId) => {
    const da = distFromTrigger.has(aId) ? distFromTrigger.get(aId) : Number.MAX_SAFE_INTEGER;
    const db = distFromTrigger.has(bId) ? distFromTrigger.get(bId) : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da < db;
    const xa = getCondPosX(aId);
    const xb = getCondPosX(bId);
    if (Math.abs(xa - xb) > 10) return xa < xb;
    const ta = getCondHits(aId);
    const tb = getCondHits(bId);
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
    for (let pass = 0; pass < activeConditions.length; pass++) {
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

  const levelMap = new Map(activeConditions.map(c => [c.nodeId, 1]));
  relaxForwardLevels(levelMap);

  const hasIncomingCond = new Set(forwardEdges.map(([, vId]) => vId));
  const hasIncomingTrig = new Set();
  activeConditions.forEach(c => {
    if ((upstreamByConditionId.get(c.nodeId) || []).some(u => u.sourceType === 'trigger')) {
      hasIncomingTrig.add(c.nodeId);
    }
  });

  const orderedCondIds = activeConditions.map(c => c.nodeId).sort(isPriorCondition ? (a, b) => (isPriorCondition(a, b) ? -1 : 1) : undefined);
  if (!hasIncomingTrig.size && orderedCondIds.length > 0) {
    hasIncomingTrig.add(orderedCondIds[0]);
  }

  orderedCondIds.forEach(nodeId => {
    if (hasIncomingCond.has(nodeId) || hasIncomingTrig.has(nodeId)) return;
    const cond = activeConditionById.get(nodeId);
    const posX = getCondPosX(nodeId);
    const hits = getCondHits(nodeId);
    let baseLevel = hasIncomingTrig.size > 0 ? 2 : 1;
    orderedCondIds.forEach(otherId => {
      if (otherId === nodeId) return;
      const otherCond = activeConditionById.get(otherId);
      const otherLvl = levelMap.get(otherId) || 1;
      const otherX = getCondPosX(otherId);
      const otherHits = getCondHits(otherId);
      if (graphEdges.length > 0 && cond?.inCurrentGraph !== false && otherCond?.inCurrentGraph !== false && posX > 0 && otherX > 0) {
        if (otherX + 60 < posX) {
          baseLevel = Math.max(baseLevel, otherLvl + 1);
        }
      } else if (otherHits > hits) {
        baseLevel = Math.max(baseLevel, otherLvl + 1);
      }
    });
    if ((levelMap.get(nodeId) || 1) < baseLevel) {
      levelMap.set(nodeId, baseLevel);
      relaxForwardLevels(levelMap);
    }
  });

  activeConditions.forEach(c => {
    c.level = levelMap.get(c.nodeId) || 1;
    c.upstreamSources = upstreamByConditionId.get(c.nodeId) || [];
  });

  activeConditions.sort((a, b) => (a.level - b.level) || (Number(b.inCurrentGraph) - Number(a.inCurrentGraph)) || ((a.position?.x || 0) - (b.position?.x || 0)) || ((b.executionCount || 0) - (a.executionCount || 0)));

  // Compute Left-to-Right Layered Positions
  const columns = new Map();
  activeConditions.forEach(c => {
    const lvl = c.level || 1;
    if (!columns.has(lvl)) columns.set(lvl, []);
    columns.get(lvl).push(c);
  });

  const nodeYMap = new Map();
  const estimateConditionHeight = cond => 96 + Math.max(1, (cond.branches || []).length) * 68;

  const sortedLevels = [...columns.keys()].sort((a, b) => a - b);
  sortedLevels.forEach(lvl => {
    const colNodes = columns.get(lvl) || [];
    colNodes.sort((a, b) => {
      const upA = (a.upstreamSources || []).filter(u => u.sourceType === 'condition');
      const upB = (b.upstreamSources || []).filter(u => u.sourceType === 'condition');
      const scoreA = upA.length
        ? upA.reduce((s, u) => s + (nodeYMap.get(u.nodeId) ?? 0) + (u.branchIdx || 0) * 80, 0) / upA.length
        : (a.position?.y || 0);
      const scoreB = upB.length
        ? upB.reduce((s, u) => s + (nodeYMap.get(u.nodeId) ?? 0) + (u.branchIdx || 0) * 80, 0) / upB.length
        : (b.position?.y || 0);
      return scoreA - scoreB || ((b.executionCount || 0) - (a.executionCount || 0));
    });

    let currentY = 40;
    if (colNodes.length === 1 && lvl > 1) {
      const parentConds = (colNodes[0].upstreamSources || []).filter(u => u.sourceType === 'condition' && nodeYMap.has(u.nodeId));
      if (parentConds.length) {
        currentY = Math.max(32, Math.round(parentConds.reduce((s, u) => s + (nodeYMap.get(u.nodeId) || 40), 0) / parentConds.length));
      }
    }
    colNodes.forEach(cond => {
      nodeYMap.set(cond.nodeId, currentY);
      currentY += estimateConditionHeight(cond) + 42;
    });
  });

  const hasTriggers = triggerNodes.length > 0 && skeletonEdges.some(e => e.edgeKind === 'trigger');
  const baseCondX = hasTriggers ? 400 : 48;
  const colStepX = 510;

  const rfNodes = [];
  if (hasTriggers) {
    const firstLevelConds = columns.get(1) || activeConditions.slice(0, 1);
    const firstY = firstLevelConds.length ? (nodeYMap.get(firstLevelConds[0].nodeId) || 40) + 28 : 60;
    triggerNodes.forEach((trig, idx) => {
      rfNodes.push({
        id: String(trig.nodeId),
        type: 'analyticsTrigger',
        position: { x: 40, y: firstY + idx * 150 },
        data: {
          nodeId: String(trig.nodeId),
          nodeName: trig.nodeName || '触发器',
          triggerHitCount: trig.triggerHitCount || trig.executionCount || 0,
          triggerHitRate: trig.triggerHitRate || 100
        }
      });
    });
  }

  activeConditions.forEach(cond => {
    const lvl = cond.level || 1;
    const x = baseCondX + (lvl - 1) * colStepX;
    const y = nodeYMap.get(cond.nodeId) ?? 40;
    rfNodes.push({
      id: cond.nodeId,
      type: 'analyticsCondition',
      position: { x, y },
      data: {
        ...cond,
        onIgnore
      }
    });
  });

  const pairCounts = new Map();
  skeletonEdges.forEach(edge => {
    const key = `${edge.source}->${edge.target}`;
    if (!pairCounts.has(key)) pairCounts.set(key, []);
    pairCounts.get(key).push(edge.id);
  });

  const rfEdges = skeletonEdges.map(edge => {
    const rate = Number(edge.rate) || 0;
    const hitCount = Number(edge.hitCount) || 0;
    const isZero = hitCount <= 0;
    const isDominant = rate >= 50 && !isZero;
    const isTrigger = edge.edgeKind === 'trigger';
    const stroke = isZero
      ? '#cbd5e1'
      : isTrigger
        ? '#8b5cf6'
        : isDominant
          ? '#2563eb'
          : '#3b82f6';
    const strokeWidth = isZero
      ? 1.5
      : Math.max(2, Math.min(5.5, 1.8 + (rate / 100) * 3.7));
    const siblings = pairCounts.get(`${edge.source}->${edge.target}`) || [edge.id];
    const siblingIdx = siblings.indexOf(edge.id);
    const labelOffset = siblings.length > 1 ? (siblingIdx - (siblings.length - 1) / 2) * 34 : 0;

    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
      type: 'analyticsSkeletonEdge',
      animated: !isZero,
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      style: {
        stroke,
        strokeWidth,
        strokeDasharray: isZero ? '5 4' : undefined
      },
      data: {
        ...edge,
        isZero,
        isDominant,
        labelOffset
      }
    };
  });

  return {
    activeConditions,
    rfNodes,
    rfEdges
  };
}

function DbConditionSkeletonCanvas({ skeletonModel, workflowId, ignoredKey }) {
  const [flowInstance, setFlowInstance] = useState(null);
  const [flowZoom, setFlowZoom] = useState(0.85);
  const [canvasNodes, setCanvasNodes] = useState(() => skeletonModel.rfNodes || []);

  useEffect(() => {
    setCanvasNodes(skeletonModel.rfNodes || []);
  }, [skeletonModel.rfNodes]);

  const fitCanvas = (instance = flowInstance, duration = 200) => {
    if (!instance) return;
    instance.fitView({ padding: 0.14, maxZoom: 0.95, minZoom: 0.25, duration });
  };

  const focusEntry = (instance = flowInstance, duration = 200) => {
    const firstNode = canvasNodes[0];
    if (!instance || !firstNode) return;
    const zoom = 0.88;
    instance.setViewport({
      x: 36 - firstNode.position.x * zoom,
      y: Math.max(24, 56 - firstNode.position.y * zoom),
      zoom
    }, { duration });
    setFlowZoom(zoom);
  };

  const resetLayout = () => {
    setCanvasNodes(skeletonModel.rfNodes || []);
    requestAnimationFrame(() => fitCanvas(flowInstance, 200));
  };

  const handleNodesChange = changes => {
    if (!changes?.length) return;
    setCanvasNodes(prevNodes => applyNodeChanges(changes, prevNodes));
  };

  return <div className="db-analytics-skeleton-wrap">
    <div className="db-analytics-skeleton-topbar">
      <div className="db-analytics-skeleton-hint">
        <BranchesOutlined />
        <span>可视化分流骨架图：按工作流上下游层级展示条件分流，已自动折叠中间普通节点（悬停连线「途经 N 个节点」可查看明细，点击节点右上角「忽略」可收起无关分流并自动直连下游）</span>
      </div>
      <Space size={6}>
        <Button size="small" icon={<FullscreenOutlined />} onClick={() => fitCanvas(flowInstance, 180)}>适应全图</Button>
        <Button size="small" onClick={() => focusEntry(flowInstance, 180)}>聚焦入口</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={resetLayout}>重置布局</Button>
        <span className="db-analytics-skeleton-zoom">{Math.round(flowZoom * 100)}%</span>
      </Space>
    </div>
    <div className="db-analytics-skeleton-canvas">
      <ReactFlow
        key={`${workflowId}:${ignoredKey}`}
        nodes={canvasNodes}
        edges={skeletonModel.rfEdges}
        nodeTypes={dbAnalyticsSkeletonNodeTypes}
        edgeTypes={dbAnalyticsSkeletonEdgeTypes}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        onInit={instance => {
          setFlowInstance(instance);
          window.setTimeout(() => {
            instance.fitView({ padding: 0.14, maxZoom: 0.92, minZoom: 0.15, duration: 0 });
            const vp = instance.getViewport?.();
            if (vp?.zoom) setFlowZoom(vp.zoom);
          }, 60);
        }}
        onMove={(_, viewport) => setFlowZoom(viewport.zoom)}
        onNodesChange={handleNodesChange}
      >
        <Background color="#cbd5e1" gap={20} size={1} />
      </ReactFlow>
    </div>
  </div>;
}

function DbAnalyticsPage({ data }) {
  if (!data?.active) return null;
  const filters = data.filters || {};
  const [nodeTypeFilter, setNodeTypeFilter] = useState('ALL');
  const [branchViewTab, setBranchViewTab] = useState('skeleton');
  const queryReady = Boolean(String(filters.workflowId || '').trim() && filters.startTime && filters.endTime);
  const connection = data.connection || {};
  const connectionStatus = connection.status || 'disconnected';
  const connectionMeta = connectionStatus === 'connected'
    ? { badge: 'success', label: '已连接', title: '数据库已连接' }
    : connectionStatus === 'error'
      ? { badge: 'error', label: '连接异常', title: connection.errorMessage || '数据库连接异常' }
      : { badge: 'default', label: '未连接', title: '数据库未连接' };
  const connectionConfigItems = (data.configs || []).map(config => ({
    key: config.id,
    label: (() => {
      const isCurrent = config.id === connection.configId;
      const status = isCurrent ? connectionStatus : 'disconnected';
      const statusMeta = status === 'connected'
        ? { badge: 'success', label: '已连接', className: 'connected' }
        : status === 'error'
          ? { badge: 'error', label: '连接异常', className: 'error' }
          : { badge: 'default', label: '未连接', className: 'disconnected' };
      return <span className="db-connection-dropdown-item">
        <span className="db-connection-dropdown-main"><Badge status={statusMeta.badge} /><span className="db-connection-dropdown-name">{displayDbConfigName(config.name)}<small>PostgreSQL - {config.host || '未设置 Host'}</small></span></span>
        <Tag className={`db-connection-dropdown-status ${statusMeta.className}`} bordered={false}>{statusMeta.label}</Tag>
      </span>;
    })(),
    disabled: data.connectionChanging
  }));

  const analytics = data.analytics;
  const overview = analytics?.overview || {};
  const latency = analytics?.latency || {};
  const branches = analytics?.branches || {};
  const errors = analytics?.errors || {};
  const workflowId = analytics?.workflow?.id || filters.workflowId || '';
  const ignoredStorageKey = workflowId ? `db-analytics-ignored-conditions:${workflowId}` : '';

  const [ignoredConditionIds, setIgnoredConditionIds] = useState([]);
  useEffect(() => {
    if (!ignoredStorageKey) {
      setIgnoredConditionIds([]);
      return;
    }
    try {
      const raw = window.localStorage?.getItem(ignoredStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setIgnoredConditionIds(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      setIgnoredConditionIds([]);
    }
  }, [ignoredStorageKey]);

  const updateIgnoredConditionIds = nextIds => {
    const normalized = [...new Set((nextIds || []).map(String).filter(Boolean))];
    setIgnoredConditionIds(normalized);
    if (ignoredStorageKey) {
      try {
        if (normalized.length) window.localStorage?.setItem(ignoredStorageKey, JSON.stringify(normalized));
        else window.localStorage?.removeItem(ignoredStorageKey);
      } catch {
        // Ignore storage write errors
      }
    }
  };

  const ignoreConditionNode = nodeId => {
    updateIgnoredConditionIds([...ignoredConditionIds, String(nodeId)]);
  };
  const restoreConditionNode = nodeId => {
    updateIgnoredConditionIds(ignoredConditionIds.filter(id => id !== String(nodeId)));
  };
  const restoreAllConditionNodes = () => {
    updateIgnoredConditionIds([]);
  };

  const allConditionNodes = branches.conditionNodes || [];
  const ignoredConditionSet = useMemo(() => new Set(ignoredConditionIds), [ignoredConditionIds]);
  const skeletonModel = useMemo(
    () => buildConditionSkeletonModel({
      flowGraph: branches.flowGraph,
      conditionNodes: allConditionNodes,
      allNodes: branches.allNodes,
      ignoredConditionSet,
      onIgnore: ignoreConditionNode
    }),
    [branches.flowGraph, allConditionNodes, branches.allNodes, ignoredConditionSet, ignoredConditionIds]
  );
  const visibleConditionNodes = skeletonModel.activeConditions;
  const ignoredConditionNodes = useMemo(
    () => allConditionNodes.filter(node => ignoredConditionSet.has(String(node.nodeId))),
    [allConditionNodes, ignoredConditionSet]
  );

  const allLatencyNodes = latency.nodes || [];
  const availableNodeTypes = useMemo(() => {
    const types = new Set(allLatencyNodes.map(item => item.nodeType).filter(Boolean));
    return ['ALL', ...types];
  }, [allLatencyNodes]);
  const filteredLatencyNodes = useMemo(() => {
    if (nodeTypeFilter === 'ALL') return allLatencyNodes;
    return allLatencyNodes.filter(item => item.nodeType === nodeTypeFilter);
  }, [allLatencyNodes, nodeTypeFilter]);
  const maxNodeP95Ms = useMemo(() => {
    return Math.max(1, ...filteredLatencyNodes.map(item => Number(item.p95Ms) || Number(item.avgMs) || 0));
  }, [filteredLatencyNodes]);

  const openSampleConversation = (sampleConversationId, sampleTriggerMessageId) => {
    if (!workflowId || !sampleConversationId) return;
    emitListToolbar('open-db-analytics-conversation', {
      workflowId,
      conversationId: sampleConversationId,
      triggerMessageId: sampleTriggerMessageId || ''
    });
  };

  const [activeErrorGroup, setActiveErrorGroup] = useState(null);
  const [errorOccurrenceKeyword, setErrorOccurrenceKeyword] = useState('');
  const [visitedErrorKeys, setVisitedErrorKeys] = useState([]);

  useEffect(() => {
    setActiveErrorGroup(null);
    setErrorOccurrenceKeyword('');
    setVisitedErrorKeys([]);
  }, [analytics]);

  const openErrorGroupDrawer = record => {
    if (!record) return;
    setActiveErrorGroup(record);
    setErrorOccurrenceKeyword('');
  };

  const allErrorOccurrences = useMemo(() => {
    if (!activeErrorGroup) return [];
    const list = Array.isArray(activeErrorGroup.occurrences) && activeErrorGroup.occurrences.length
      ? activeErrorGroup.occurrences
      : (activeErrorGroup.sampleConversationId
          ? [{
              key: `sample:${activeErrorGroup.sampleConversationId}:${activeErrorGroup.sampleTriggerMessageId || ''}:0`,
              executionId: '',
              conversationId: activeErrorGroup.sampleConversationId,
              triggerMessageId: activeErrorGroup.sampleTriggerMessageId || '',
              occurredAt: activeErrorGroup.lastOccurredAt || '',
              durationMs: 0,
              errorMessage: activeErrorGroup.errorMessage || ''
            }]
          : []);
    return list.map((item, idx) => ({
      ...item,
      seqNo: idx + 1,
      key: item.key || `${item.executionId || idx}:${item.conversationId || ''}:${item.triggerMessageId || ''}:${idx}`
    }));
  }, [activeErrorGroup]);

  const filteredErrorOccurrences = useMemo(() => {
    const kw = errorOccurrenceKeyword.trim().toLowerCase();
    if (!kw) return allErrorOccurrences;
    return allErrorOccurrences.filter(item =>
      String(item.conversationId || '').toLowerCase().includes(kw)
      || String(item.triggerMessageId || '').toLowerCase().includes(kw)
      || String(item.occurredAt || '').toLowerCase().includes(kw)
      || String(item.executionId || '').toLowerCase().includes(kw)
    );
  }, [allErrorOccurrences, errorOccurrenceKeyword]);

  const visitedErrorKeySet = useMemo(() => new Set(visitedErrorKeys), [visitedErrorKeys]);
  const visitedCountInActiveGroup = useMemo(
    () => allErrorOccurrences.filter(item => visitedErrorKeySet.has(item.key)).length,
    [allErrorOccurrences, visitedErrorKeySet]
  );

  const handleLocateErrorOccurrence = occ => {
    if (!occ?.conversationId) return;
    if (occ.key && !visitedErrorKeySet.has(occ.key)) {
      setVisitedErrorKeys(prev => [...prev, occ.key]);
    }
    openSampleConversation(occ.conversationId, occ.triggerMessageId);
  };

  const latencyColumns = [
    {
      title: '节点名称',
      dataIndex: 'nodeName',
      width: 240,
      fixed: 'left',
      render: (value, record) => {
        const meta = dbNodeMeta(record.nodeType);
        return <Flex align="center" gap={6} wrap={false}>
          <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.name}</Tag>
          <Text strong ellipsis={{ tooltip: `${value || record.nodeId} (${record.nodeId})` }} style={{ maxWidth: 140 }}>{value || record.nodeId}</Text>
          {record.isHistorical ? <Tag color="gold" bordered={false}>历史版本</Tag> : null}
        </Flex>;
      }
    },
    {
      title: '执行次数',
      dataIndex: 'executionCount',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.executionCount || 0) - (b.executionCount || 0),
      render: (value, record) => <Tooltip title={`覆盖 ${record.triggerHitCount || 0} 轮触发（${record.triggerHitRate || 0}%）`}><Text strong>{value || 0}</Text></Tooltip>
    },
    {
      title: '平均耗时',
      dataIndex: 'avgMs',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.avgMs || 0) - (b.avgMs || 0),
      render: value => <Text>{formatAnalyticsDuration(value)}</Text>
    },
    {
      title: 'P50 耗时',
      dataIndex: 'p50Ms',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.p50Ms || 0) - (b.p50Ms || 0),
      render: value => <Text type="secondary">{formatAnalyticsDuration(value)}</Text>
    },
    {
      title: 'P95 耗时 (慢节点定位)',
      dataIndex: 'p95Ms',
      width: 240,
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.p95Ms || 0) - (b.p95Ms || 0),
      render: (value, record) => {
        const num = Number(value) || 0;
        const pct = Math.min(100, Math.max(4, Math.round((num / maxNodeP95Ms) * 100)));
        const isSlow = num >= 3000;
        const isMedium = num >= 1000 && num < 3000;
        return <div className="db-analytics-latency-bar-cell">
          <div className="db-analytics-latency-bar-head">
            <span className={`db-analytics-latency-value ${isSlow ? 'slow' : isMedium ? 'medium' : ''}`}>{formatAnalyticsDuration(value)}</span>
            {isSlow ? <Tag color="red" bordered={false}>慢节点</Tag> : null}
          </div>
          <div className="db-analytics-progress-track">
            <div className={`db-analytics-progress-fill ${isSlow ? 'danger' : isMedium ? 'warning' : 'primary'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>;
      }
    },
    {
      title: '最大耗时',
      dataIndex: 'maxMs',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.maxMs || 0) - (b.maxMs || 0),
      render: value => <Text strong>{formatAnalyticsDuration(value)}</Text>
    },
    {
      title: '节点报错率',
      dataIndex: 'errorRate',
      width: 120,
      align: 'right',
      sorter: (a, b) => (a.errorRate || 0) - (b.errorRate || 0),
      render: (value, record) => record.errorCount > 0
        ? <Tag color="red">{value}% ({record.errorCount})</Tag>
        : <Text type="secondary">0%</Text>
    },
    {
      title: '慢样本排障',
      key: 'slowestSample',
      width: 150,
      align: 'center',
      render: (_, record) => record.slowestSample?.conversationId
        ? <Tooltip title={`最慢耗时 ${formatAnalyticsDuration(record.slowestSample.durationMs)} · Conversation: ${record.slowestSample.conversationId}`}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openSampleConversation(record.slowestSample.conversationId, record.slowestSample.triggerMessageId)}>查看最慢样本</Button>
          </Tooltip>
        : <Text type="secondary">-</Text>
    }
  ];

  const allNodesColumns = [
    {
      title: '节点名称',
      dataIndex: 'nodeName',
      width: 260,
      render: (value, record) => {
        const meta = dbNodeMeta(record.nodeType);
        return <Flex align="center" gap={6} wrap={false}>
          <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.name}</Tag>
          <Text strong ellipsis={{ tooltip: `${value || record.nodeId} (${record.nodeId})` }} style={{ maxWidth: 160 }}>{value || record.nodeId}</Text>
          {record.isHistorical ? <Tag color="gold" bordered={false}>历史版本</Tag> : null}
        </Flex>;
      }
    },
    {
      title: '触发命中轮次',
      dataIndex: 'triggerHitCount',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.triggerHitCount || 0) - (b.triggerHitCount || 0),
      render: value => <Text strong>{value || 0} 轮</Text>
    },
    {
      title: <Tooltip title="计算公式：触发命中轮次 ÷ 总触发轮次 × 100%（同一轮触发内多次经过同一节点按 1 轮计）"><span>轮次命中比例</span></Tooltip>,
      dataIndex: 'triggerHitRate',
      width: 240,
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.triggerHitRate || 0) - (b.triggerHitRate || 0),
      render: (value, record) => {
        const rate = Number(value) || 0;
        return <Tooltip title={`${record.triggerHitCount || 0} 轮命中 / 共 ${overview.totalTriggers || 0} 轮触发`}>
          <div className="db-analytics-rate-cell">
            <div className="db-analytics-progress-track">
              <div className="db-analytics-progress-fill primary" style={{ width: `${Math.min(100, rate)}%` }} />
            </div>
            <span className="db-analytics-rate-text">{rate}%</span>
          </div>
        </Tooltip>;
      }
    },
    {
      title: '节点总执行次数',
      dataIndex: 'executionCount',
      width: 130,
      align: 'right',
      sorter: (a, b) => (a.executionCount || 0) - (b.executionCount || 0),
      render: value => <Text>{value || 0} 次</Text>
    },
    {
      title: '成功 / 报错次数',
      key: 'statusCounts',
      width: 140,
      align: 'right',
      render: (_, record) => <span><Text type="success">{record.successCount || 0}</Text> / <Text type={record.errorCount > 0 ? 'danger' : 'secondary'}>{record.errorCount || 0}</Text></span>
    },
    {
      title: '报错率',
      dataIndex: 'errorRate',
      width: 110,
      align: 'right',
      sorter: (a, b) => (a.errorRate || 0) - (b.errorRate || 0),
      render: (value, record) => record.errorCount > 0 ? <Tag color="red">{value}%</Tag> : <Tag color="green">0%</Tag>
    }
  ];

  const errorColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 68,
      align: 'center',
      render: (_, __, index) => <span className={`db-analytics-rank-badge ${index < 3 ? 'top' : ''}`}>#{index + 1}</span>
    },
    {
      title: '故障节点',
      dataIndex: 'nodeName',
      width: 220,
      render: (value, record) => {
        const meta = dbNodeMeta(record.nodeType);
        return <Flex align="center" gap={6} wrap={false}>
          <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.name}</Tag>
          <Text strong ellipsis={{ tooltip: `${value || record.nodeId} (${record.nodeId})` }} style={{ maxWidth: 130 }}>{value || record.nodeId}</Text>
        </Flex>;
      }
    },
    {
      title: '错误码 / 异常类型',
      dataIndex: 'errorCode',
      width: 180,
      render: (value, record) => <Space size={4} wrap>
        <Tag color="red">{value || record.errorClass || record.status || 'ERROR'}</Tag>
        {record.errorClass && record.errorClass !== value ? <Tag>{record.errorClass}</Tag> : null}
      </Space>
    },
    {
      title: '错误信息 (error_message)',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: value => <Flex align="center" gap={6} style={{ minWidth: 0 }}>
        <Tooltip title={value}><Text className="db-analytics-error-msg" ellipsis>{value || '-'}</Text></Tooltip>
        {value ? <Tooltip title="复制报错信息"><Button type="text" size="small" shape="circle" icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(value).then(() => window.showGlobalMessage?.('已复制报错信息'))} /></Tooltip> : null}
      </Flex>
    },
    {
      title: '报错次数 / 占比',
      dataIndex: 'errorCount',
      width: 150,
      align: 'right',
      render: (value, record) => <Space size={6}>
        <Text strong type="danger">{value} 次</Text>
        <Tag color="volcano" bordered={false}>{record.errorShareRate}%</Tag>
      </Space>
    },
    {
      title: '波及范围',
      key: 'affected',
      width: 150,
      align: 'right',
      render: (_, record) => <Text type="secondary">{record.affectedConversations} 会话 / {record.affectedTriggers} 轮</Text>
    },
    {
      title: '最近发生时间',
      dataIndex: 'lastOccurredAt',
      width: 175,
      render: value => <Text type="secondary">{value || '-'}</Text>
    },
    {
      title: '操作',
      key: 'actions',
      width: 136,
      align: 'center',
      render: (_, record) => {
        const hasOccurrences = (Array.isArray(record.occurrences) && record.occurrences.length > 0) || Boolean(record.sampleConversationId);
        if (!hasOccurrences) return <Text type="secondary">-</Text>;
        return <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openErrorGroupDrawer(record)}>
          定位排障
        </Button>;
      }
    }
  ];

  const errorOccurrenceColumns = [
    {
      title: '序号',
      dataIndex: 'seqNo',
      width: 68,
      align: 'center',
      render: value => <span className="db-analytics-rank-badge">#{value}</span>
    },
    {
      title: '发生时间',
      dataIndex: 'occurredAt',
      width: 170,
      render: value => <Text type="secondary">{value || '-'}</Text>
    },
    {
      title: '会话 ID (conversation_id)',
      dataIndex: 'conversationId',
      width: 200,
      ellipsis: true,
      render: value => value
        ? <Flex align="center" gap={4} style={{ minWidth: 0 }}>
            <Tooltip title={value}><Text code ellipsis style={{ maxWidth: 155 }}>{value}</Text></Tooltip>
            <Tooltip title="复制会话 ID">
              <Button
                type="text"
                size="small"
                shape="circle"
                icon={<CopyOutlined />}
                onClick={() => navigator.clipboard?.writeText(value).then(() => window.showGlobalMessage?.('已复制会话 ID'))}
              />
            </Tooltip>
          </Flex>
        : <Text type="secondary">-</Text>
    },
    {
      title: '触发轮次 ID (trigger_message_id)',
      dataIndex: 'triggerMessageId',
      width: 210,
      ellipsis: true,
      render: value => value
        ? <Flex align="center" gap={4} style={{ minWidth: 0 }}>
            <Tooltip title={value}><Text code ellipsis style={{ maxWidth: 165 }}>{value}</Text></Tooltip>
            <Tooltip title="复制触发轮次 ID">
              <Button
                type="text"
                size="small"
                shape="circle"
                icon={<CopyOutlined />}
                onClick={() => navigator.clipboard?.writeText(value).then(() => window.showGlobalMessage?.('已复制触发轮次 ID'))}
              />
            </Tooltip>
          </Flex>
        : <Text type="secondary">-</Text>
    },
    {
      title: '节点耗时',
      dataIndex: 'durationMs',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.durationMs || 0) - (b.durationMs || 0),
      render: value => <Text type="secondary">{formatAnalyticsDuration(value)}</Text>
    },
    {
      title: '操作',
      key: 'locate',
      width: 140,
      align: 'center',
      fixed: 'right',
      render: (_, occ) => {
        const visited = visitedErrorKeySet.has(occ.key);
        return <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            disabled={!occ.conversationId}
            onClick={() => handleLocateErrorOccurrence(occ)}
          >
            定位排障
          </Button>
          {visited ? <Tag color="processing" bordered={false} style={{ marginInlineEnd: 0 }}>已看</Tag> : null}
        </Space>;
      }
    }
  ];

  return <div className="db-analytics-page">
    <div className="db-record-toolbar db-analytics-toolbar">
      <div className="db-analytics-filter-rows">
        {/* 第一行：数据库选择 + 工作流选择 */}
        <div className="db-analytics-filter-row db-analytics-filter-row-top">
          <div className="db-filter-field db-analytics-field-db">
            <span>数据库</span>
            <Dropdown
              menu={{ items: connectionConfigItems, selectedKeys: connection.configId ? [connection.configId] : [], onClick: ({ key }) => emitListToolbar('switch-db-config', { configId: key }) }}
              popupRender={menus => <div className="db-connection-dropdown"><div className="db-connection-dropdown-title">当前数据库配置</div>{menus}<div className="db-connection-dropdown-actions"><Button type="text" danger icon={<DisconnectOutlined />} disabled={connectionStatus !== 'connected' || data.connectionChanging} onClick={() => emitListToolbar('disconnect-db')}>断开当前连接</Button></div></div>}
              trigger={['click']}
              disabled={!connectionConfigItems.length || data.connectionChanging}
            >
              <Tooltip title={connectionMeta.title}>
                <Button className="db-connection-status-trigger" loading={data.connectionChanging} aria-label="数据库连接状态">
                  <Badge status={connectionMeta.badge} />
                  <span>{displayDbConfigName(connection.name)}（{connectionMeta.label}）</span>
                  <DownOutlined />
                </Button>
              </Tooltip>
            </Dropdown>
          </div>
          <div className="db-filter-field db-analytics-field-workflow">
            <span><b>*</b>工作流</span>
            <Select
              className="db-filter-control"
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.workflowId || undefined}
              loading={data.workflowsLoading || data.connectionChanging}
              onOpenChange={open => open && emitListToolbar('ensure-db-workflows')}
              onChange={value => emitListToolbarChange('db-analytics-workflow-id', value || '')}
              options={(data.workflows || []).map(workflow => ({ value: workflow.id, label: `${workflow.id}-${workflow.name}` }))}
              placeholder="请选择要分析的工作流"
            />
          </div>
        </div>

        {/* 第二行：时间范围筛选 + 3个按钮 */}
        <div className="db-analytics-filter-row db-analytics-filter-row-bottom">
          <div className="db-filter-field db-filter-field-time">
            <span><b>*</b>统计时间范围（最长 15 天）</span>
            <DbDateTimeRangePicker
              className="db-filter-control"
              maxDays={15}
              startTime={filters.startTime}
              endTime={filters.endTime}
              onChange={values => emitListToolbarChange('db-analytics-time-range', values)}
            />
          </div>
          <div className="db-analytics-row-actions">
            <Space size={8}>
              <Button icon={<ReloadOutlined />} onClick={() => emitListToolbar('reset-db-analytics')}>重置</Button>
              <Button type="primary" icon={<DatabaseOutlined />} loading={data.loading} disabled={!queryReady} onClick={() => emitListToolbar('query-db-analytics')}>开始分析</Button>
              <Tooltip title="按当前筛选条件重新统计">
                <Button icon={<ReloadOutlined />} disabled={!queryReady || data.loading} onClick={() => emitListToolbar('refresh-db-analytics')}>刷新数据</Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    </div>

    {!data.queried && !data.loading ? (
      <div className="db-record-empty db-analytics-empty">
        <Text type="secondary">请选择工作流与统计时间范围后，点击「开始分析」生成运行质量与性能报告</Text>
      </div>
    ) : (
      <Spin spinning={data.loading} tip="正在统计工作流运行数据...">
        {analytics ? (
          <div className="db-analytics-content">
            {/* 1. 整体运行概览 */}
            <section className="db-analytics-section">
              <div className="db-analytics-section-header">
                <div className="db-analytics-section-title-group">
                  <span className="db-analytics-section-title">一、整体运行概览</span>
                  {analytics.workflow?.name ? <Tag color="blue">{analytics.workflow.id} · {analytics.workflow.name}</Tag> : null}
                  <Text type="secondary" className="db-analytics-section-sub">{analytics.timeRange?.startTime} ~ {analytics.timeRange?.endTime}</Text>
                </div>
              </div>
              <div className="db-analytics-kpi-grid">
                <div className="db-analytics-kpi-card">
                  <span className="db-analytics-kpi-label">总会话数 (Conversations)</span>
                  <strong className="db-analytics-kpi-value">{overview.totalConversations || 0}</strong>
                  <span className="db-analytics-kpi-sub">正常 {Math.max(0, (overview.totalConversations || 0) - (overview.errorConversations || 0))} · 含报错 {overview.errorConversations || 0}</span>
                </div>
                <div className="db-analytics-kpi-card">
                  <span className="db-analytics-kpi-label">总触发轮次 (Triggers)</span>
                  <strong className="db-analytics-kpi-value">{overview.totalTriggers || 0}</strong>
                  <span className="db-analytics-kpi-sub">AI回复 {overview.repliedTriggers || 0} ({overview.replyTriggerRate || 0}%) · 不回复 {overview.noReplyTriggers || 0}</span>
                </div>
                <div className={`db-analytics-kpi-card ${analyticsErrorRateLevel(overview.conversationErrorRate)}`}>
                  <span className="db-analytics-kpi-label">会话级报错率</span>
                  <strong className="db-analytics-kpi-value">{overview.conversationErrorRate || 0}%</strong>
                  <span className="db-analytics-kpi-sub">{overview.errorConversations || 0} / {overview.totalConversations || 0} 个会话出现异常</span>
                </div>
                <div className={`db-analytics-kpi-card ${analyticsErrorRateLevel(overview.triggerErrorRate)}`}>
                  <span className="db-analytics-kpi-label">轮次级报错率</span>
                  <strong className="db-analytics-kpi-value">{overview.triggerErrorRate || 0}%</strong>
                  <span className="db-analytics-kpi-sub">{overview.errorTriggers || 0} / {overview.totalTriggers || 0} 轮触发异常{overview.pendingTriggers ? ` · 待处理 ${overview.pendingTriggers}` : ''}</span>
                </div>
                <div className={`db-analytics-kpi-card ${analyticsErrorRateLevel(overview.nodeErrorRate)}`}>
                  <span className="db-analytics-kpi-label">节点级报错率</span>
                  <strong className="db-analytics-kpi-value">{overview.nodeErrorRate || 0}%</strong>
                  <span className="db-analytics-kpi-sub">{overview.errorNodeExecutions || 0} / {overview.totalNodeExecutions || 0} 次节点执行失败</span>
                </div>
                <div className="db-analytics-kpi-card">
                  <span className="db-analytics-kpi-label">单轮端到端 P95 耗时</span>
                  <strong className="db-analytics-kpi-value">{formatAnalyticsDuration(latency.endToEnd?.p95Ms)}</strong>
                  <span className="db-analytics-kpi-sub">平均 {formatAnalyticsDuration(latency.endToEnd?.avgMs)} · 最大 {formatAnalyticsDuration(latency.endToEnd?.maxMs)}</span>
                </div>
              </div>
            </section>

            {/* 2. 耗时与性能分析 */}
            <section className="db-analytics-section">
              <div className="db-analytics-section-header">
                <div className="db-analytics-section-title-group">
                  <span className="db-analytics-section-title">二、耗时与性能分析</span>
                  <Text type="secondary" className="db-analytics-section-sub">端到端单轮响应耗时 + 各节点平均 / P50 / P95 / 最大耗时排行</Text>
                </div>
                <Space size={8}>
                  <Text type="secondary">节点类型筛选：</Text>
                  <Select
                    size="small"
                     style={{ width: 160 }}
                    value={nodeTypeFilter}
                    onChange={setNodeTypeFilter}
                    options={availableNodeTypes.map(type => ({
                      value: type,
                      label: type === 'ALL' ? '全部节点类型' : `${dbNodeMeta(type).name} (${type})`
                    }))}
                  />
                </Space>
              </div>

              <div className="db-analytics-e2e-grid">
                <div className="db-analytics-e2e-card">
                  <div className="db-analytics-e2e-head">
                    <div>
                      <span className="db-analytics-e2e-title">全链路单轮端到端耗时</span>
                      <span className="db-analytics-e2e-desc">触发器 started_at → 该轮末节点 completed_at（有效样本 {latency.endToEnd?.count || 0} 轮）</span>
                    </div>
                    {latency.endToEnd?.slowestSample?.conversationId ? (
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openSampleConversation(latency.endToEnd.slowestSample.conversationId, latency.endToEnd.slowestSample.triggerMessageId)}>定位最慢轮次</Button>
                    ) : null}
                  </div>
                  <div className="db-analytics-e2e-metrics">
                    <div><span>平均耗时</span><strong>{formatAnalyticsDuration(latency.endToEnd?.avgMs)}</strong></div>
                    <div><span>P50 中位数</span><strong>{formatAnalyticsDuration(latency.endToEnd?.p50Ms)}</strong></div>
                    <div><span>P95 耗时</span><strong className="highlight">{formatAnalyticsDuration(latency.endToEnd?.p95Ms)}</strong></div>
                    <div><span>最大耗时</span><strong>{formatAnalyticsDuration(latency.endToEnd?.maxMs)}</strong></div>
                  </div>
                </div>

                <div className="db-analytics-e2e-card">
                  <div className="db-analytics-e2e-head">
                    <div>
                      <span className="db-analytics-e2e-title">AI 回复端到端耗时</span>
                      <span className="db-analytics-e2e-desc">触发器 started_at → 发送消息节点 completed_at（有回复样本 {latency.reply?.count || 0} 轮）</span>
                    </div>
                    {latency.reply?.slowestSample?.conversationId ? (
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openSampleConversation(latency.reply.slowestSample.conversationId, latency.reply.slowestSample.triggerMessageId)}>定位最慢回复</Button>
                    ) : null}
                  </div>
                  <div className="db-analytics-e2e-metrics">
                    <div><span>平均耗时</span><strong>{formatAnalyticsDuration(latency.reply?.avgMs)}</strong></div>
                    <div><span>P50 中位数</span><strong>{formatAnalyticsDuration(latency.reply?.p50Ms)}</strong></div>
                    <div><span>P95 耗时</span><strong className="highlight">{formatAnalyticsDuration(latency.reply?.p95Ms)}</strong></div>
                    <div><span>最大耗时</span><strong>{formatAnalyticsDuration(latency.reply?.maxMs)}</strong></div>
                  </div>
                </div>
              </div>

              <Table
                className="ant-list-table db-analytics-table"
                size="small"
                rowKey="nodeId"
                columns={latencyColumns}
                dataSource={filteredLatencyNodes}
                pagination={filteredLatencyNodes.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
                scroll={{ x: 1120 }}
                locale={{ emptyText: '所选范围内暂无节点耗时数据' }}
              />
            </section>

            {/* 3. 分支走向与节点命中统计 */}
            <section className="db-analytics-section">
              <div className="db-analytics-section-header">
                <div className="db-analytics-section-title-group">
                  <span className="db-analytics-section-title">三、分支走向与节点命中统计</span>
                  <Text type="secondary" className="db-analytics-section-sub">条件节点 (condition) 上下游分流骨架图 + 全工作流节点触发命中率</Text>
                </div>
                <Radio.Group size="small" value={branchViewTab} onChange={e => setBranchViewTab(e.target.value)} optionType="button" buttonStyle="solid">
                  <Radio.Button value="skeleton">分流骨架流向图 ({visibleConditionNodes.length}/{allConditionNodes.length})</Radio.Button>
                  <Radio.Button value="condition">条件分支卡片 ({visibleConditionNodes.length}/{allConditionNodes.length})</Radio.Button>
                  <Radio.Button value="all">全量节点命中表 ({branches.allNodes?.length || 0})</Radio.Button>
                </Radio.Group>
              </div>

              {branchViewTab === 'skeleton' || branchViewTab === 'condition' ? (
                <>
                  {ignoredConditionNodes.length > 0 ? (
                    <div className="db-analytics-ignored-bar">
                      <span className="db-analytics-ignored-label">已忽略 {ignoredConditionNodes.length} 个条件节点（已自动折叠并直连上下游分流）：</span>
                      <div className="db-analytics-ignored-tags">
                        {ignoredConditionNodes.map(node => (
                          <Tag
                            key={node.nodeId}
                            closable
                            onClose={e => {
                              e.preventDefault();
                              restoreConditionNode(node.nodeId);
                            }}
                          >
                            {node.nodeName}
                          </Tag>
                        ))}
                      </div>
                      <Button type="link" size="small" onClick={restoreAllConditionNodes}>全部恢复</Button>
                    </div>
                  ) : null}
                  {visibleConditionNodes.length ? (
                    branchViewTab === 'skeleton' ? (
                      <DbConditionSkeletonCanvas
                        skeletonModel={skeletonModel}
                        workflowId={workflowId}
                        ignoredKey={ignoredConditionIds.join(',')}
                      />
                    ) : (
                      <div className="db-analytics-condition-grid">
                        {visibleConditionNodes.map(condNode => (
                          <div key={condNode.nodeId} className="db-analytics-condition-card">
                            <div className="db-analytics-condition-card-head">
                              <div className="db-analytics-condition-card-top">
                                <Flex align="center" gap={6} className="db-analytics-condition-card-title">
                                  <Tag color={dbNodeMeta('condition').color}>L{condNode.level || 1} 条件分支</Tag>
                                  <Text strong ellipsis={{ tooltip: condNode.nodeName }}>{condNode.nodeName}</Text>
                                  {condNode.isHistorical ? <Tag color="gold" bordered={false}>历史节点</Tag> : null}
                                </Flex>
                                <Space size={8} align="center" className="db-analytics-condition-card-meta">
                                  <Text type="secondary">共执行 {condNode.executionCount} 次 · 轮次命中率 {condNode.triggerHitRate}%</Text>
                                  <Tooltip title="忽略此条件节点的分支走向分析">
                                    <Button
                                      type="text"
                                      size="small"
                                      className="db-analytics-ignore-btn"
                                      onClick={() => ignoreConditionNode(condNode.nodeId)}
                                    >
                                      忽略
                                    </Button>
                                  </Tooltip>
                                </Space>
                              </div>
                              {(condNode.upstreamSources || []).length > 0 ? (
                                <div className="db-analytics-condition-card-from">
                                  来自：{condNode.upstreamSources.map(u => u.sourceType === 'trigger' ? `⚡${u.nodeName}` : `${u.nodeName}[${u.branchName}]`).join('、')}
                                </div>
                              ) : null}
                            </div>
                            <div className="db-analytics-branch-list">
                              {(condNode.branches || []).map(branch => {
                                const downstreamList = Array.isArray(branch.downstreamConditions) ? branch.downstreamConditions : [];
                                return (
                                  <div key={branch.branchKey} className="db-analytics-branch-row">
                                    <div className="db-analytics-branch-info">
                                      <span className="db-analytics-branch-name">{branch.branchName}</span>
                                      {downstreamList.length > 0 ? (
                                        <span className="db-analytics-branch-target">
                                          ↳ 下游分流：{downstreamList.map(d => `${d.nodeName}${d.viaCount > 0 ? `(经${d.viaCount}节点)` : ''}`).join('、')}
                                        </span>
                                      ) : branch.targetNodeName ? (
                                        <span className="db-analytics-branch-target">→ {branch.targetNodeName}</span>
                                      ) : null}
                                    </div>
                                    <div className="db-analytics-branch-bar-wrap">
                                      <div className="db-analytics-progress-track">
                                        <div className="db-analytics-progress-fill branch" style={{ width: `${Math.min(100, Number(branch.branchRate) || 0)}%` }} />
                                      </div>
                                    </div>
                                    <div className="db-analytics-branch-stats">
                                      <strong>{branch.hitCount} 次</strong>
                                      <span>分支占比 {branch.branchRate}%</span>
                                      <small>全局轮次 {branch.workflowRate}%</small>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="db-analytics-sub-empty">
                      <Text type="secondary">
                        {allConditionNodes.length ? '当前所有条件分支节点均已被忽略，可点击上方「全部恢复」重新查看' : '当前工作流无条件分支节点'}
                      </Text>
                    </div>
                  )}
                </>
              ) : (
                <Table
                  className="ant-list-table db-analytics-table"
                  size="small"
                  rowKey="nodeId"
                  columns={allNodesColumns}
                  dataSource={branches.allNodes || []}
                  pagination={(branches.allNodes || []).length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
                  scroll={{ x: 980 }}
                />
              )}
            </section>

            {/* 4. 异常与报错聚合 Top N */}
            <section className="db-analytics-section">
              <div className="db-analytics-section-header">
                <div className="db-analytics-section-title-group">
                  <span className="db-analytics-section-title">四、异常与报错聚合 (Top N)</span>
                  <Text type="secondary" className="db-analytics-section-sub">按 node_name、error_code、error_message 聚合高频故障节点</Text>
                </div>
                <Tag color={(errors.totalErrorExecutions || 0) > 0 ? 'red' : 'green'}>
                  {(errors.totalErrorExecutions || 0) > 0
                    ? `共 ${errors.totalErrorExecutions} 次节点报错 · ${errors.items?.length || 0} 类故障`
                    : '0 次报错 · 运行健康'}
                </Tag>
              </div>

              {(errors.items || []).length ? (
                <Table
                  className="ant-list-table db-analytics-table"
                  size="small"
                  rowKey="key"
                  columns={errorColumns}
                  dataSource={errors.items || []}
                  pagination={false}
                  scroll={{ x: 1120 }}
                />
              ) : (
                <div className="db-analytics-sub-empty healthy">
                  <CheckCircleFilled style={{ color: '#10b981', fontSize: 18 }} />
                  <Text type="secondary">所选时间范围内未发现任何节点执行异常或报错</Text>
                </div>
              )}
            </section>

            <Drawer
              title={activeErrorGroup ? (
                <Flex align="center" gap={8} wrap="wrap">
                  <Tag color={dbNodeMeta(activeErrorGroup.nodeType).color} style={{ marginInlineEnd: 0 }}>
                    {dbNodeMeta(activeErrorGroup.nodeType).name}
                  </Tag>
                  <Text strong>{activeErrorGroup.nodeName || activeErrorGroup.nodeId}</Text>
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>报错明细与逐条定位</Text>
                  <Tag color="red" style={{ marginInlineEnd: 0 }}>共 {activeErrorGroup.errorCount || allErrorOccurrences.length} 次报错</Tag>
                </Flex>
              ) : '报错明细与逐条定位'}
              placement="right"
              width={820}
              open={Boolean(data?.active !== false && activeErrorGroup)}
              onClose={() => setActiveErrorGroup(null)}
            >
              {activeErrorGroup ? (
                <div className="db-analytics-error-drawer-body">
                  <div className="db-analytics-error-drawer-summary">
                    <div className="db-analytics-error-drawer-meta-row">
                      <Space size={6} wrap>
                        <Text type="secondary">异常类型：</Text>
                        <Tag color="red">{activeErrorGroup.errorCode || activeErrorGroup.errorClass || activeErrorGroup.status || 'ERROR'}</Tag>
                        {activeErrorGroup.errorClass && activeErrorGroup.errorClass !== activeErrorGroup.errorCode ? (
                          <Tag>{activeErrorGroup.errorClass}</Tag>
                        ) : null}
                        <Tag color="volcano" bordered={false}>占总报错 {activeErrorGroup.errorShareRate || 0}%</Tag>
                        <Tag color="default" bordered={false}>
                          波及 {activeErrorGroup.affectedConversations || 0} 会话 / {activeErrorGroup.affectedTriggers || 0} 轮触发
                        </Tag>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        最近发生：{activeErrorGroup.lastOccurredAt || '-'}
                      </Text>
                    </div>
                    <div className="db-analytics-error-drawer-msg-box">
                      <div className="db-analytics-error-drawer-msg-head">
                        <Text type="secondary" style={{ fontSize: 12 }}>聚合报错信息 (error_message)</Text>
                        {activeErrorGroup.errorMessage ? (
                          <Button
                            type="link"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => navigator.clipboard?.writeText(activeErrorGroup.errorMessage).then(() => window.showGlobalMessage?.('已复制报错信息'))}
                          >
                            复制报错
                          </Button>
                        ) : null}
                      </div>
                      <div className="db-analytics-error-drawer-msg-content">
                        {activeErrorGroup.errorMessage || activeErrorGroup.errorSummary || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="db-analytics-error-drawer-toolbar">
                    <Space size={8} wrap>
                      <Text strong>报错记录列表</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        共 {filteredErrorOccurrences.length} 条{errorOccurrenceKeyword.trim() ? `（总计 ${allErrorOccurrences.length} 条）` : ''} · 点击右侧「定位排障」可逐条跳转至对应会话轮次，返回后自动保留当前进度
                      </Text>
                      {visitedCountInActiveGroup > 0 ? (
                        <Tag color="processing" bordered={false}>已定位 {visitedCountInActiveGroup} / {allErrorOccurrences.length} 条</Tag>
                      ) : null}
                    </Space>
                    <Input.Search
                      allowClear
                      size="small"
                      placeholder="搜索会话 ID / 触发轮次 ID / 发生时间..."
                      value={errorOccurrenceKeyword}
                      onChange={e => setErrorOccurrenceKeyword(e.target.value)}
                      style={{ width: 270 }}
                    />
                  </div>

                  <Table
                    className="ant-list-table db-analytics-table db-analytics-error-occurrences-table"
                    size="small"
                    rowKey="key"
                    columns={errorOccurrenceColumns}
                    dataSource={filteredErrorOccurrences}
                    scroll={{ x: 760 }}
                    pagination={{
                      defaultPageSize: 20,
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: total => `共 ${total} 条报错记录`
                    }}
                  />
                </div>
              ) : null}
            </Drawer>
          </div>
        ) : null}
      </Spin>
    )}
  </div>;
}

function AppTabs({ activeView }) {
  return <Tabs activeKey={activeView} onChange={value => emitListToolbar('switch-view', { value })} items={[{ key: 'cases', label: '测试用例' }, { key: 'records', label: '测试记录' }, { key: 'dbRecords', label: '会话记录查询（DB）' }, { key: 'dbAnalytics', label: '工作流运行分析（DB）' }, { key: 'labels', label: '标签与场景' }]} />;
}

function LabelManagementPage({ data }) {
  const [activeKey, setActiveKey] = useState('userTags');
  const [search, setSearch] = useState('');
  const [selectedNames, setSelectedNames] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [target, setTarget] = useState(null);
  const [unusedDeleteOpen, setUnusedDeleteOpen] = useState(false);
  const [action, setAction] = useState('archive');
  const [replacement, setReplacement] = useState('');
  const isTag = activeKey === 'userTags';
  const label = isTag ? '用户标签' : '业务场景';
  const items = (data?.[activeKey] || []).filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const activeItems = (data?.[activeKey] || []).filter(item => item.status === 'active' && item.name !== target?.name);
  const unusedCount = (data?.[activeKey] || []).filter(item => !item.usageCount).length;
  useEffect(() => {
    const availableNames = new Set((data?.[activeKey] || []).map(item => item.name));
    setSelectedNames(names => names.filter(name => availableNames.has(name)));
  }, [activeKey, data]);
  const resetAction = () => {
    setTarget(null);
    setAction('archive');
    setReplacement('');
  };
  const requestAction = nextAction => {
    if (!target) return;
    emitListToolbar('manage-label-item', { labelType: activeKey, action: nextAction, name: target.name, replacement });
    resetAction();
  };
  const columns = [
    { title: '名称', dataIndex: 'name', render: value => <Text>{value}</Text> },
    { title: '使用用例数', dataIndex: 'usageCount', width: 120, align: 'center' },
    { title: '状态', dataIndex: 'status', width: 112, render: value => <Tag color={value === 'active' ? 'green' : 'default'} variant="outlined">{value === 'active' ? '启用' : '已归档'}</Tag> },
    { title: '操作', key: 'actions', width: 220, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_, item) => <Space size={4}>{item.status === 'active' ? <Button type="link" size="small" onClick={() => emitListToolbar('manage-label-item', { labelType: activeKey, action: 'archive', name: item.name })}>归档</Button> : <Button type="link" size="small" onClick={() => emitListToolbar('manage-label-item', { labelType: activeKey, action: 'restore', name: item.name })}>恢复</Button>}{item.usageCount ? <Button type="link" size="small" onClick={() => { setTarget(item); setAction('replace'); }}>替换</Button> : null}<Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => { if (item.usageCount) { setTarget(item); setAction('archive'); } else emitListToolbar('manage-label-item', { labelType: activeKey, action: 'delete', name: item.name }); }}>删除</Button></Space> }
  ];
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    emitListToolbar('manage-label-item', { labelType: activeKey, action: 'create', name });
    setNewName('');
    setCreateOpen(false);
  };
  const replacementAction = isTag ? 'remove' : 'clear';
  const replacementLabel = isTag ? '移除' : '清空';
  const unusedDeleteLabel = `删除未使用${label}`;
  const targetInUse = Boolean(target?.usageCount);
  const bulkHeaderActive = selectedNames.length > 0;
  const bulkHeader = <Flex align="center" justify="space-between" gap={16}>
    <Text>{`已选择 ${selectedNames.length} 项`}</Text>
    <Button danger onClick={() => emitListToolbar('delete-selected-label-items', { labelType: activeKey, names: selectedNames })}>批量删除</Button>
  </Flex>;
  const tableColumns = bulkHeaderActive
    ? columns.map((column, index) => index === 0
      ? { ...column, title: bulkHeader, onHeaderCell: () => ({ colSpan: columns.length }) }
      : { ...column, title: null, onHeaderCell: () => ({ colSpan: 0 }) })
    : columns;
  return <div className="ant-list-page label-management-page">
    <Tabs activeKey={activeKey} onChange={key => { setActiveKey(key); setSearch(''); setSelectedNames([]); setUnusedDeleteOpen(false); }} items={[
      { key: 'userTags', label: '用户标签' },
      { key: 'businessScenarios', label: '业务场景' }
    ]} />
    <Flex justify="space-between" align="center" gap={16} wrap>
      <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={`搜索${label}`} style={{ width: 300 }} />
      <Space size={8}>
        <Button danger icon={<DeleteOutlined />} disabled={!unusedCount} onClick={() => setUnusedDeleteOpen(true)}>{unusedDeleteLabel}</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增{label}</Button>
      </Space>
    </Flex>
    <Table className="ant-list-table" size="middle" rowKey="name" columns={tableColumns} dataSource={items} tableLayout="auto" rowSelection={{ selectedRowKeys: selectedNames, onChange: setSelectedNames }} pagination={{ pageSize: 20, showSizeChanger: false, showTotal: total => `共 ${total} 条` }} />
    <Modal open={createOpen} centered title={`新增${label}`} onCancel={() => setCreateOpen(false)} footer={<Space><Button onClick={() => setCreateOpen(false)}>取消</Button><Button type="primary" disabled={!newName.trim()} onClick={create}>新增</Button></Space>}>
      <Input value={newName} onChange={event => setNewName(event.target.value)} placeholder={`输入${label}名称`} />
    </Modal>
    <Modal open={Boolean(target)} centered title={targetInUse ? `处理“${target?.name || ''}”` : `确认删除“${target?.name || ''}”`} onCancel={resetAction} footer={<Space><Button onClick={resetAction}>取消</Button>{targetInUse ? <Button type="primary" disabled={action === 'replace' && !replacement} onClick={() => requestAction(action)}>{action === 'archive' ? '归档' : action === 'replace' ? '替换' : replacementLabel}</Button> : <Button type="primary" danger onClick={() => requestAction('delete')}>删除</Button>}</Space>}>
      {targetInUse ? <Flex vertical gap={16}><Text>该项当前被 {target?.usageCount} 个测试用例使用。</Text><Radio.Group value={action} onChange={event => setAction(event.target.value)}><Flex vertical gap={12}><Radio value="archive">归档</Radio><Radio value="replace">替换为其他{label}</Radio><Radio value={replacementAction}>{replacementLabel}</Radio></Flex></Radio.Group>{action === 'replace' ? <Select value={replacement || undefined} onChange={setReplacement} options={activeItems.map(item => ({ value: item.name, label: item.name }))} placeholder={`选择替换后的${label}`} style={{ width: '100%' }} /> : null}</Flex> : <Text>确认删除“{target?.name}”吗？该项当前未被测试用例使用。</Text>}
    </Modal>
    <Modal open={unusedDeleteOpen} centered title={`确认${unusedDeleteLabel}`} onCancel={() => setUnusedDeleteOpen(false)} footer={<Space><Button onClick={() => setUnusedDeleteOpen(false)}>取消</Button><Button type="primary" danger onClick={() => { emitListToolbar('delete-unused-label-items', { labelType: activeKey }); setUnusedDeleteOpen(false); }}>删除</Button></Space>}>
      <Text>将删除 {unusedCount} 个未被测试用例使用的{label}，删除后不可恢复。确认继续吗？</Text>
    </Modal>
  </div>;
}

function SendDialog({ data }) {
  const [selectedAgentId, setSelectedAgentId] = useState(data.defaultAgentId || '');
  const [searchAgentId, setSearchAgentId] = useState('');
  const [mqConfigId, setMqConfigId] = useState('');
  useEffect(() => {
    if (!data.open) return;
    setSelectedAgentId(data.defaultAgentId || '');
    setSearchAgentId('');
    setMqConfigId(data.defaultMqConfigId || '');
  }, [data.defaultAgentId, data.defaultMqConfigId, data.open]);
  const agentId = selectedAgentId || searchAgentId.trim();
  return <Modal open={data.open} centered title="发送配置" onCancel={() => emitListToolbar('cancel-send')} footer={<Space><Button onClick={() => emitListToolbar('cancel-send')}>取消</Button><Button type="primary" disabled={!mqConfigId} onClick={() => emitListToolbar('confirm-send', { agentId, mqConfigId })}>发送并记录</Button></Space>}>
    <label className="send-dialog-label">设置 Agent ID</label>
    <Select showSearch allowClear value={selectedAgentId || undefined} searchValue={searchAgentId} onSearch={setSearchAgentId} onChange={value => { setSelectedAgentId(value || ''); setSearchAgentId(''); }} options={data.agents.map(value => ({ value, label: value }))} placeholder="选择或输入 Agent ID" style={{ width: '100%' }} popupRender={origin => <>{origin}{searchAgentId.trim() && !data.agents.includes(searchAgentId.trim()) ? <Button type="link" block onMouseDown={event => event.preventDefault()} onClick={() => { const value = searchAgentId.trim(); setSelectedAgentId(value); setSearchAgentId(''); emitListToolbar('create-agent-id', { agentId: value }); }}>新建 Agent ID“{searchAgentId.trim()}”</Button> : null}</>} />
    <label className="send-dialog-label">MQ 配置</label>
    <Select value={mqConfigId || undefined} onChange={setMqConfigId} options={(data.mqConfigs || []).map(config => ({ value: config.id, label: config.name }))} placeholder="选择 MQ 配置" style={{ width: '100%' }} />
  </Modal>;
}

function emptyMqConfig() {
  return { name: '', gatewayUrl: '', appId: '', topic: '', producerGroup: '', secretKey: '', nameServer: '', messageType: 'ROCKETMQ_COMMON_TYPE', hasSecretKey: false };
}

function MqSettingsPanel({ data }) {
  const configs = data.mqConfigs || [];
  const [selectedId, setSelectedId] = useState(data.mqSelectedId || configs[0]?.id || '__new__');
  const [form, setForm] = useState(emptyMqConfig);
  const [parseText, setParseText] = useState('');
  const [parseError, setParseError] = useState('');
  const selectConfig = id => {
    setSelectedId(id);
    setParseText('');
    setParseError('');
    const config = configs.find(item => item.id === id);
    setForm(config ? { ...config, secretKey: '' } : emptyMqConfig());
  };
  useEffect(() => {
    if (!data.open) return;
    selectConfig(data.mqSelectedId || configs[0]?.id || '__new__');
  }, [data.open, data.mqSelectedId, configs]);
  const setField = field => event => setForm(current => ({ ...current, [field]: event.target.value }));
  const parseConfigText = () => {
    try {
      const parsed = JSON.parse(parseText);
      const source = parsed.java || parsed['c++'] || parsed;
      const gatewayValue = [
        source.gatewayUrl, source.GatewayUrl, source.gatewayURL, source.GatewayURL, source.gatewayAddress, source.GatewayAddress, source.MQ_GATEWAY_URL, source.mqGatewayUrl,
        parsed.gatewayUrl, parsed.GatewayUrl, parsed.gatewayURL, parsed.GatewayURL, parsed.gatewayAddress, parsed.GatewayAddress, parsed.MQ_GATEWAY_URL, parsed.mqGatewayUrl
      ].find(value => typeof value === 'string' && value.trim());
      const gatewayUrl = gatewayValue ? gatewayValue.trim().replace(/\/api\/mq\/(?:send|status)\/?$/, '').replace(/\/+$/, '') : '';
      setForm(current => ({
        ...current,
        name: source.MQConfigName || source.name || current.name,
        gatewayUrl: gatewayUrl || current.gatewayUrl,
        appId: source.APPID || source.appId || current.appId,
        topic: source.Topic || source.topic || current.topic,
        producerGroup: source.ProducerGroup || source.ConsumerGroup || source.ConsumerId || source.producerGroup || current.producerGroup,
        secretKey: source.SecretKey || source.AccessKey || source.secretKey || current.secretKey,
        nameServer: source.NameServer || source.nameServer || current.nameServer,
        messageType: source.MessageType || source.messageType || current.messageType
      }));
      setParseError('');
    } catch (err) {
      setParseError('配置文本不是有效 JSON');
    }
  };
  const copyConfigText = async () => {
    const text = JSON.stringify({
      java: {
        MQConfigName: form.name,
        MQ_GATEWAY_URL: form.gatewayUrl,
        APPID: form.appId,
        Topic: form.topic,
        ProducerGroup: form.producerGroup,
        SecretKey: form.secretKey,
        NameServer: form.nameServer,
        MessageType: form.messageType
      }
    }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      window.showGlobalMessage?.('已复制配置信息');
    } catch (error) {
      window.showGlobalMessage?.('复制失败，请检查浏览器剪贴板权限', 'error');
    }
  };
  const menuItems = [...configs.map(config => ({
    key: config.id,
    label: <SettingsMenuLabel
      name={config.name || '未命名 MQ 配置'}
      deleteTitle={`删除 MQ 配置“${config.name || '未命名配置'}”？`}
      deleteDescription="删除后将无法恢复。"
      deleteAriaLabel={`删除 MQ 配置 ${config.name || '未命名配置'}`}
      onDelete={() => emitListToolbar('delete-mq-config', { configId: config.id })}
    />
  })), { type: 'divider' }, { key: '__new__', icon: <PlusOutlined />, label: '新增 MQ 配置' }];
  const complete = form.gatewayUrl && form.appId && form.topic && form.producerGroup && form.nameServer && form.messageType && (form.secretKey || form.hasSecretKey);
  return <Flex className="mq-settings-layout" gap={16}>
    <aside className="mq-settings-nav"><Menu mode="inline" selectedKeys={[selectedId]} items={menuItems} onClick={({ key }) => selectConfig(key)} /></aside>
    <section className="mq-settings-form">
      <Flex justify="space-between" align="center"><Title level={5} style={{ margin: 0 }}>{selectedId === '__new__' ? '新增 MQ 配置' : 'MQ 配置'}</Title><Space><Button type="link" onClick={copyConfigText}>复制配置信息</Button><Button type="primary" disabled={!complete} onClick={() => emitListToolbar('save-mq-config', { config: { ...form, id: selectedId === '__new__' ? undefined : selectedId } })}>保存配置</Button></Space></Flex>
      <div className="mq-config-grid">
        <label>MQ 配置名称<Input value={form.name} onChange={setField('name')} /></label>
        <label><RequiredFieldLabel>网关地址</RequiredFieldLabel><Input value={form.gatewayUrl} onChange={setField('gatewayUrl')} placeholder="http://host:port" /></label>
        <label><RequiredFieldLabel>App ID</RequiredFieldLabel><Input value={form.appId} onChange={setField('appId')} /></label>
        <label><RequiredFieldLabel>Topic</RequiredFieldLabel><Input value={form.topic} onChange={setField('topic')} /></label>
        <label><RequiredFieldLabel>Producer Group</RequiredFieldLabel><Input value={form.producerGroup} onChange={setField('producerGroup')} /></label>
        <label><RequiredFieldLabel>NameServer</RequiredFieldLabel><Input value={form.nameServer} onChange={setField('nameServer')} /></label>
        <label><RequiredFieldLabel>Message Type</RequiredFieldLabel><Input value={form.messageType} onChange={setField('messageType')} /></label>
        <label><RequiredFieldLabel>Secret Key</RequiredFieldLabel><Input.Password value={form.secretKey} onChange={setField('secretKey')} placeholder={form.hasSecretKey ? '已配置，留空不修改' : ''} /></label>
      </div>
      <label className="mq-config-parser">解析配置文本<Input.TextArea value={parseText} onChange={event => setParseText(event.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} /><Flex justify="space-between" align="center"><Text type="danger">{parseError}</Text><Button onClick={parseConfigText}>解析并填入</Button></Flex></label>
    </section>
  </Flex>;
}

function SystemSettingsDialog({ data }) {
  return <Modal open={data.open} centered title="系统设置" width={920} onCancel={() => emitListToolbar('close-system-settings')} footer={null} destroyOnHidden>
    <Tabs className="system-settings-tabs" activeKey={data.activeTab || 'mq'} onChange={value => emitListToolbar('set-system-settings-tab', { value })} items={[
      { key: 'mq', label: 'MQ 发送配置', children: <MqSettingsPanel data={data} /> },
      { key: 'database', label: '数据库配置', children: <DbSettingsPanel data={data} /> }
    ]} />
  </Modal>;
}

function SystemSettingsButton({ visible }) {
  return visible ? <Tooltip title="系统设置"><Button type="text" icon={<SettingOutlined />} aria-label="系统设置" onClick={() => emitListToolbar('open-system-settings')}>系统设置</Button></Tooltip> : null;
}

function UpdateSourceIcon({ sourceKey }) {
  const source = sourceKey === 'github' ? 'github' : 'modelscope';
  return <img className="update-source-image" src={`assets/${source}.png`} alt="" aria-hidden="true" />;
}

function UpdateSourceLabel({ source }) {
  const detail = source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本';
  return <Space size={6}><UpdateSourceIcon sourceKey={source.key} /><span>{source.label}</span><Text type="secondary">{detail}</Text></Space>;
}

function UpdateDialog({ data }) {
  const status = data.status || {};
  const check = data.check;
  const applying = Boolean(data.applying);
  const [sourceKey, setSourceKey] = useState('');
  const release = check?.release;
  const sourceOrder = { modelscope: 0, github: 1 };
  const sourceStates = [...(check?.sources || (status.sources || []).map(source => ({ ...source, ok: null })))].sort((left, right) => (sourceOrder[left.key] ?? 99) - (sourceOrder[right.key] ?? 99));
  const selectableSources = sourceStates.filter(source => source.ok && source.updateAvailable);
  useEffect(() => {
    if (!data.open) return;
    setSourceKey(selectableSources.find(source => source.key === 'modelscope')?.key || selectableSources[0]?.key || '');
  }, [data.open, check]);
  const selectedSource = selectableSources.find(source => source.key === sourceKey) || selectableSources[0];
  const targetVersion = selectedSource?.version || release?.version || '-';
  const currentVersion = check?.currentVersion || status.currentVersion || '-';
  const checkSummary = !check
    ? <Alert type="info" showIcon message="尚未检查更新" description="将依次检查固定的 GitHub 与魔搭更新源。" />
    : !check.updateAvailable
      ? <Alert type={sourceStates.some(source => source.ok) ? 'success' : 'warning'} showIcon message={sourceStates.some(source => source.ok) ? '当前已是最新版本' : '更新源暂不可用'} description={`当前版本 ${currentVersion}`} />
      : null;
  const modalTitle = check?.updateAvailable
    ? <Flex vertical gap={2} className="update-dialog-title"><Text type="success" strong>发现新版本</Text><Flex align="center" gap={8} wrap><Title level={4}>更新至 v{targetVersion}</Title><Text type="secondary" className="update-dialog-current-version">当前版本 v{currentVersion}</Text></Flex></Flex>
    : '在线更新';
  return <Modal open={data.open} centered className="update-dialog-modal" title={modalTitle} width={760} styles={{ container: { padding: 0 }, header: { marginBottom: 0, padding: '24px 28px 0' }, body: { padding: '24px 28px 0' }, close: { top: 24, right: 24 } }} onCancel={() => emitListToolbar('close-update-dialog')} footer={null} destroyOnHidden>
    <Flex vertical gap={24} className="update-dialog-content">
      {!check?.updateAvailable ? <Flex vertical gap={8}><Text strong>当前版本 {currentVersion}</Text><Space size={[4, 4]} wrap>{sourceStates.map(source => <Tag key={source.key} color={source.ok === false ? 'red' : source.ok ? 'blue' : 'default'} icon={<UpdateSourceIcon sourceKey={source.key} />}>{source.label} · {source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本'}</Tag>)}</Space></Flex> : null}
      {checkSummary}
      {release?.notes?.length ? <Flex vertical gap={4}><Text strong>更新说明</Text>{release.notes.map((note, index) => <Text key={`${note}-${index}`}>- {note}</Text>)}</Flex> : null}
      {check?.updateAvailable ? <Flex vertical gap={24}><Flex vertical gap={12}><Text type="secondary" className="update-source-section-label">选择更新源</Text><Radio.Group className="update-source-grid" value={sourceKey} onChange={event => setSourceKey(event.target.value)}>{sourceStates.map(source => <Radio key={source.key} className={`update-source-card ${sourceKey === source.key ? 'is-selected' : ''}`} value={source.key} disabled={applying || !source.ok || !source.updateAvailable}><Flex className="update-source-card-content" align="center" justify="space-between" gap={16}><Space className="update-source-card-main" size={16}><span className="update-source-brand-icon"><UpdateSourceIcon sourceKey={source.key} /></span><Flex vertical gap={0}><Text strong className="update-source-name">{source.label}</Text><Text type="secondary" className="update-source-version">{source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本'}</Text></Flex></Space>{sourceKey === source.key ? <CheckCircleFilled className="update-source-check" aria-hidden="true" /> : <span className="update-source-check update-source-check-empty" aria-hidden="true" />}</Flex></Radio>)}</Radio.Group></Flex><Text type="secondary" className="update-source-hint">将从 {selectedSource?.label || '-'} 更新至 v{targetVersion}。更新前会自动备份当前版本，完成后会自动刷新页面。</Text><Flex className="update-dialog-actions" justify="flex-end" gap={8}><Button disabled={applying} onClick={() => emitListToolbar('close-update-dialog')}>取消</Button><Button type="primary" loading={applying} disabled={!sourceKey || applying} icon={<ReloadOutlined />} onClick={() => emitListToolbar('apply-online-update', { sourceKey })}>立即更新</Button></Flex></Flex> : null}
    </Flex>
  </Modal>;
}

function AppVersion({ currentVersion }) {
  return <Tooltip title="检查在线更新"><Button type="text" className="app-version-button" aria-label={`版本 ${currentVersion || '-'}，检查更新`} onClick={() => emitListToolbar('check-update-from-version')}>{currentVersion ? `v${currentVersion}` : 'v-'}</Button></Tooltip>;
}

function UpdateManagerButton({ visible, updateAvailable }) {
  if (!visible || !updateAvailable) return null;
  return <Tooltip title="发现新版本，选择来源后更新"><Button type="text" className="new-version-trigger" aria-label="有新版本" onClick={() => emitListToolbar('open-update-dialog')}><Tag color="green" variant="solid" bordered={false} className="new-version-tag">有新版本</Tag></Button></Tooltip>;
}

function ImportCaseDialog({ data, onCancel, onConfirm }) {
  const [selectedScenario, setSelectedScenario] = useState('');
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [scenarioSource, setScenarioSource] = useState(data.format === 'json' ? 'file' : 'uniform');
  const supportsFileScenario = data.format === 'json';
  const scenarios = data.scenarios || [];
  const archivedScenarios = data.archivedScenarios || [];
  const createScenario = () => {
    const value = scenarioSearch.trim();
    if (!value) return;
    setSelectedScenario(value);
    setScenarioSearch('');
  };
  const scenarioOptions = [...new Set([...scenarios, selectedScenario].filter(Boolean))]
    .filter(value => !scenarioSearch.trim() || value.includes(scenarioSearch.trim()))
    .map(value => ({ value, label: value }));
  const canCreateScenario = scenarioSearch.trim() && ![...scenarios, ...archivedScenarios, selectedScenario].filter(Boolean).includes(scenarioSearch.trim());
  return <Modal open centered title="导入测试用例" onCancel={onCancel} footer={<Space><Button onClick={onCancel}>取消</Button><Button type="primary" onClick={() => onConfirm({ scenarioSource, businessScenario: scenarioSource === 'uniform' ? selectedScenario : '' })}>开始导入</Button></Space>}>
    <Flex vertical gap={8}>
      <label className="send-dialog-label">业务场景</label>
      {supportsFileScenario ? <Radio.Group value={scenarioSource} onChange={event => setScenarioSource(event.target.value)} vertical options={[{ value: 'file', label: '使用文件中场景' }, { value: 'uniform', label: '统一设置' }]} /> : null}
      {scenarioSource === 'uniform' ? <Select showSearch={{ filterOption: false, searchValue: scenarioSearch, onSearch: setScenarioSearch }} allowClear value={selectedScenario || undefined} onChange={value => { setSelectedScenario(value || ''); setScenarioSearch(''); }} onClear={() => { setSelectedScenario(''); setScenarioSearch(''); }} options={scenarioOptions} placeholder="选择或创建业务场景" style={{ width: '100%' }} popupRender={origin => <>{origin}{canCreateScenario ? <Button type="link" block onMouseDown={event => event.preventDefault()} onClick={createScenario}>创建“{scenarioSearch.trim()}”</Button> : null}</>} /> : null}
    </Flex>
  </Modal>;
}

function BatchEditDialog({ data, onCancel, onConfirm }) {
  const [changeScenario, setChangeScenario] = useState(false);
  const [changeTags, setChangeTags] = useState(false);
  const [fieldChanges, setFieldChanges] = useState({ latestMsgTime: false, friendNick: false, weworkAccountAlias: false, lingxiAccount: false, addTime: false });
  const [fieldValues, setFieldValues] = useState({ latestMsgTime: '', friendNick: '', weworkAccountAlias: '', lingxiAccount: 'mqSender', addTime: '' });
  const [businessScenario, setBusinessScenario] = useState('');
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [tags, setTags] = useState([]);
  const scenarios = data.scenarios || [];
  const archivedScenarios = data.archivedScenarios || [];
  const scenarioOptions = [...new Set([...scenarios, businessScenario].filter(Boolean))]
    .filter(value => !scenarioSearch.trim() || value.includes(scenarioSearch.trim()))
    .map(value => ({ value, label: value }));
  const canCreateScenario = scenarioSearch.trim() && ![...scenarios, ...archivedScenarios, businessScenario].filter(Boolean).includes(scenarioSearch.trim());
  const createScenario = () => {
    const value = scenarioSearch.trim();
    if (!value) return;
    setBusinessScenario(value);
    setScenarioSearch('');
  };
  const sessionFields = [
    { key: 'latestMsgTime', label: '最新消息时间', type: 'datetime' },
    { key: 'friendNick', label: '好友昵称', type: 'text' },
    { key: 'weworkAccountAlias', label: '企微账号别名', type: 'text' },
    { key: 'lingxiAccount', label: '灵犀后台账号名', type: 'text' },
    { key: 'addTime', label: '添加时间', type: 'datetime' }
  ];
  const hasSessionFieldChanges = Object.values(fieldChanges).some(Boolean);
  const setFieldChange = (key, checked) => setFieldChanges(current => ({ ...current, [key]: checked }));
  const setFieldValue = (key, value) => setFieldValues(current => ({ ...current, [key]: value }));
  return <Modal open centered title="批量修改测试用例" onCancel={onCancel} footer={<Space><Button onClick={onCancel}>取消</Button><Button type="primary" disabled={!changeScenario && !changeTags && !hasSessionFieldChanges} onClick={() => onConfirm({ changeScenario, businessScenario, changeTags, tags, fieldChanges, fieldValues })}>确定</Button></Space>}>
    <Flex vertical gap={16}>
      <Text type="secondary">已选择 {data.count} 个测试用例</Text>
      <Flex vertical gap={8}>
        <Checkbox checked={changeScenario} onChange={event => setChangeScenario(event.target.checked)}>业务场景</Checkbox>
        {changeScenario ? <Select showSearch={{ filterOption: false, searchValue: scenarioSearch, onSearch: setScenarioSearch }} allowClear value={businessScenario || undefined} onChange={value => { setBusinessScenario(value || ''); setScenarioSearch(''); }} onClear={() => { setBusinessScenario(''); setScenarioSearch(''); }} options={scenarioOptions} placeholder="选择或创建业务场景" style={{ width: '100%' }} popupRender={origin => <>{origin}{canCreateScenario ? <Button type="link" block onMouseDown={event => event.preventDefault()} onClick={createScenario}>创建“{scenarioSearch.trim()}”</Button> : null}</>} /> : null}
      </Flex>
      <Flex vertical gap={8}>
        <Checkbox checked={changeTags} onChange={event => setChangeTags(event.target.checked)}>TagList</Checkbox>
        {changeTags ? <Select mode="tags" value={tags} options={(data.userTags || []).map(value => ({ value, label: value }))} tokenSeparators={[',', '，', ';']} onChange={values => setTags(values.filter(value => !(data.archivedUserTags || []).includes(value)))} placeholder="选择或输入 TagList" style={{ width: '100%' }} /> : null}
      </Flex>
      {sessionFields.map(field => <Flex key={field.key} vertical gap={8}>
        <Checkbox checked={fieldChanges[field.key]} onChange={event => setFieldChange(field.key, event.target.checked)}>{field.label}（{field.key}）</Checkbox>
        {fieldChanges[field.key] ? field.type === 'datetime'
          ? <DatePicker showTime allowClear value={fieldValues[field.key] ? dayjs(fieldValues[field.key]) : null} onChange={(_, value) => setFieldValue(field.key, value || '')} format="YYYY-MM-DD HH:mm:ss" placeholder={`选择${field.label}`} style={{ width: '100%' }} />
          : <Input value={fieldValues[field.key]} onChange={event => setFieldValue(field.key, event.target.value)} placeholder={`输入${field.label}`} />
          : null}
      </Flex>)}
    </Flex>
  </Modal>;
}

function AppendRecordMessageDialog({ onCancel, onConfirm }) {
  const [messageText, setMessageText] = useState('');
  const message = messageText.trim();
  return <Modal open centered title="追加消息" onCancel={onCancel} footer={<Space><Button onClick={onCancel}>取消</Button><Button type="primary" disabled={!message} onClick={() => onConfirm(message)}>发送</Button></Space>}>
    <Flex vertical gap={12}>
      <Text type="secondary">本消息将发送到同一会话窗口</Text>
      <Input.TextArea value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="输入要追加发送的消息" autoSize={{ minRows: 4, maxRows: 8 }} />
    </Flex>
  </Modal>;
}

function DetailHeader({ detail }) {
  return (
    <Flex className="antd-detail-header" align="center" justify="flex-start" gap={12}>
      <Tooltip title="返回测试用例列表">
        <Button type="text" shape="circle" icon={<ArrowLeftOutlined />} aria-label="返回测试用例列表" onClick={() => emit('back')} />
      </Tooltip>
      <Title level={5} style={{ margin: 0 }}>编辑-{detail.name || '未命名用例'}</Title>
    </Flex>
  );
}

function RecordDetailHeader() {
  return (
    <Flex className="antd-detail-header" align="center" justify="flex-start" gap={12}>
      <Tooltip title="返回测试记录列表">
        <Button type="text" shape="circle" icon={<ArrowLeftOutlined />} aria-label="返回测试记录列表" onClick={() => document.dispatchEvent(new CustomEvent('record-detail-action', { detail: { type: 'back' } }))} />
      </Tooltip>
      <Title level={5} style={{ margin: 0 }}>测试记录详情</Title>
    </Flex>
  );
}

function DbConversationDetailHeader({ detail }) {
  const title = detail?.loading ? '会话记录详情' : `${detail?.workflowId || '-'} · ${detail?.conversationId || '-'}`;
  return (
    <Flex className="antd-detail-header db-conversation-detail-header" align="center" justify="flex-start" gap={12}>
      <Flex align="center" gap={12}>
        <Tooltip title="返回会话记录列表">
          <Button type="text" shape="circle" icon={<ArrowLeftOutlined />} aria-label="返回会话记录列表" onClick={() => emitListToolbar('back-db-conversations')} />
        </Tooltip>
        <Flex className="antd-detail-summary" vertical gap={2}>
          <Title level={5} style={{ margin: 0 }}>{title}</Title>
          {detail?.workflowName ? <Text type="secondary">{detail.workflowName}</Text> : null}
        </Flex>
      </Flex>
    </Flex>
  );
}

function DetailActions() {
  return (
    <Space wrap size={16}>
      <Button icon={<SendOutlined />} onClick={() => emit('send')}>通过MQ发送</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={() => emit('save')}>保存用例</Button>
    </Space>
  );
}

let headerRoot;
let actionsRoot;
let unsavedChangesRoot;
let appTabsRoot;
let caseListRoot;
let recordListRoot;
let dbRecordsRoot;
let dbAnalyticsRoot;
let labelManagementRoot;
let sendDialogRoot;
let importCaseRoot;
let batchEditRoot;
let appendRecordMessageRoot;
let systemSettingsButtonRoot;
let systemSettingsRoot;
let appVersionRoot;
let updateManagerButtonRoot;
let updateDialogRoot;

function showUnsavedCaseChangesDialog() {
  const host = document.getElementById('unsavedCaseChangesDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'unsavedCaseChangesDialog' }));
  unsavedChangesRoot ||= createRoot(host);
  return new Promise(resolve => {
    const close = choice => {
      unsavedChangesRoot.render(null);
      resolve(choice);
    };
    unsavedChangesRoot.render(
      <ConfigProvider componentSize="middle">
        <Modal open title="未保存的内容" closable={false} maskClosable={false} keyboard={false} footer={<Space><Button onClick={() => close('cancel')}>取消</Button><Button onClick={() => close('discard')}>不保存</Button><Button type="primary" onClick={() => close('save')}>保存并离开</Button></Space>}>
          <Text>当前编辑内容尚未保存，是否保存后离开？</Text>
        </Modal>
      </ConfigProvider>
    );
  });
}

function showBatchDeleteConfirm(count, itemLabel = '测试用例') {
  return new Promise(resolve => {
    Modal.confirm({
      title: '确认批量删除',
      content: `确定删除已选的 ${count} 个${itemLabel}吗？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

function renderCaseDetailChrome(detail) {
  const headerHost = document.getElementById('caseDetailHeader');
  const actionsHost = document.getElementById('caseDetailActions');
  if (!headerHost || !actionsHost) return;
  headerRoot ||= createRoot(headerHost);
  actionsRoot ||= createRoot(actionsHost);
  const app = detail ? <DetailHeader key={detail.id} detail={detail} /> : null;
  headerRoot.render(<ConfigProvider componentSize="middle">{app}</ConfigProvider>);
  actionsRoot.render(<ConfigProvider componentSize="middle">{detail ? <DetailActions /> : null}</ConfigProvider>);
}

window.renderCaseDetailChrome = renderCaseDetailChrome;
window.renderRecordDetailChrome = detail => {
  const headerHost = document.getElementById('caseDetailHeader');
  const actionsHost = document.getElementById('caseDetailActions');
  if (!headerHost || !actionsHost) return;
  headerRoot ||= createRoot(headerHost);
  actionsRoot ||= createRoot(actionsHost);
  headerRoot.render(<ConfigProvider componentSize="middle">{detail ? <RecordDetailHeader /> : null}</ConfigProvider>);
  actionsRoot.render(null);
};
window.renderDbConversationDetailChrome = detail => {
  const headerHost = document.getElementById('caseDetailHeader');
  const actionsHost = document.getElementById('caseDetailActions');
  if (!headerHost || !actionsHost) return;
  headerRoot ||= createRoot(headerHost);
  actionsRoot ||= createRoot(actionsHost);
  headerRoot.render(<ConfigProvider componentSize="middle">{detail ? <DbConversationDetailHeader detail={detail} /> : null}</ConfigProvider>);
  actionsRoot.render(null);
};
window.showUnsavedCaseChangesDialog = showUnsavedCaseChangesDialog;
window.showBatchDeleteConfirm = showBatchDeleteConfirm;
window.showDbEnvironmentRequiredDialog = () => {
  Modal.warning({
    title: '请先设置数据库环境',
    content: '当前数据库配置尚未设置环境，请在系统设置中选择线上环境或测试环境。',
    okText: '去系统设置',
    onOk: () => emitListToolbar('open-db-settings')
  });
};

window.showBatchEditDialog = data => {
  const host = document.getElementById('batchEditDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'batchEditDialog' }));
  batchEditRoot ||= createRoot(host);
  return new Promise(resolve => {
    const close = value => {
      batchEditRoot.render(null);
      resolve(value);
    };
    batchEditRoot.render(<ConfigProvider componentSize="middle"><BatchEditDialog data={data} onCancel={() => close(null)} onConfirm={close} /></ConfigProvider>);
  });
};

window.showAppendRecordMessageDialog = () => {
  const host = document.getElementById('appendRecordMessageDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'appendRecordMessageDialog' }));
  appendRecordMessageRoot ||= createRoot(host);
  return new Promise(resolve => {
    const close = value => {
      appendRecordMessageRoot.render(null);
      resolve(value);
    };
    appendRecordMessageRoot.render(<ConfigProvider componentSize="middle"><AppendRecordMessageDialog onCancel={() => close(null)} onConfirm={close} /></ConfigProvider>);
  });
};

window.showImportCaseDialog = data => {
  const host = document.getElementById('importCaseDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'importCaseDialog' }));
  importCaseRoot ||= createRoot(host);
  return new Promise(resolve => {
    const close = value => {
      importCaseRoot.render(null);
      resolve(value);
    };
    importCaseRoot.render(<ConfigProvider componentSize="middle"><ImportCaseDialog data={data} onCancel={() => close(null)} onConfirm={close} /></ConfigProvider>);
  });
};

window.renderAntListPages = data => {
  const tabsHost = document.getElementById('appTabs');
  const caseHost = document.getElementById('caseListApp');
  const recordHost = document.getElementById('recordListApp');
  const dbRecordsHost = document.getElementById('dbRecordsApp');
  const dbAnalyticsHost = document.getElementById('dbAnalyticsApp');
  const labelManagementHost = document.getElementById('labelManagementApp');
  if (!tabsHost || !caseHost || !recordHost || !dbRecordsHost || !labelManagementHost) return;
  appTabsRoot ||= createRoot(tabsHost);
  caseListRoot ||= createRoot(caseHost);
  recordListRoot ||= createRoot(recordHost);
  dbRecordsRoot ||= createRoot(dbRecordsHost);
  if (dbAnalyticsHost) dbAnalyticsRoot ||= createRoot(dbAnalyticsHost);
  labelManagementRoot ||= createRoot(labelManagementHost);
  appTabsRoot.render(<ConfigProvider componentSize="middle"><AppTabs activeView={data.activeView} /></ConfigProvider>);
  caseListRoot.render(<ConfigProvider componentSize="middle"><CaseListPage data={data.cases} /></ConfigProvider>);
  recordListRoot.render(<ConfigProvider componentSize="middle"><RecordListPage data={data.records} /></ConfigProvider>);
  dbRecordsRoot.render(<ConfigProvider componentSize="middle"><DbRecordsPage data={data.dbRecords} /></ConfigProvider>);
  if (dbAnalyticsRoot) dbAnalyticsRoot.render(<ConfigProvider componentSize="middle"><DbAnalyticsPage data={data.dbAnalytics} /></ConfigProvider>);
  labelManagementRoot.render(<ConfigProvider componentSize="middle"><LabelManagementPage data={data.management} /></ConfigProvider>);
};

window.renderSendDialog = data => {
  const host = document.getElementById('sendDialogApp');
  if (!host) return;
  sendDialogRoot ||= createRoot(host);
  sendDialogRoot.render(<ConfigProvider componentSize="middle"><SendDialog data={data} /></ConfigProvider>);
};

window.renderSystemSettingsButton = data => {
  const host = document.getElementById('systemSettingsApp');
  if (!host) return;
  systemSettingsButtonRoot ||= createRoot(host);
  systemSettingsButtonRoot.render(<ConfigProvider componentSize="middle"><SystemSettingsButton visible={data.visible} /></ConfigProvider>);
};

window.renderSystemSettings = data => {
  const host = document.getElementById('systemSettingsDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'systemSettingsDialog' }));
  systemSettingsRoot ||= createRoot(host);
  systemSettingsRoot.render(<ConfigProvider componentSize="middle"><SystemSettingsDialog data={data} /></ConfigProvider>);
};

window.renderUpdateManagerButton = data => {
  const versionHost = document.getElementById('appVersionApp');
  if (versionHost) {
    appVersionRoot ||= createRoot(versionHost);
    appVersionRoot.render(<ConfigProvider componentSize="middle"><AppVersion currentVersion={data.currentVersion} /></ConfigProvider>);
  }
  const host = document.getElementById('updateManagerApp');
  if (!host) return;
  updateManagerButtonRoot ||= createRoot(host);
  updateManagerButtonRoot.render(<ConfigProvider componentSize="middle"><UpdateManagerButton visible={data.visible} updateAvailable={data.updateAvailable} /></ConfigProvider>);
};

window.renderUpdateDialog = data => {
  const host = document.getElementById('updateDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'updateDialog' }));
  updateDialogRoot ||= createRoot(host);
  updateDialogRoot.render(<ConfigProvider componentSize="middle"><UpdateDialog data={data} /></ConfigProvider>);
};

document.dispatchEvent(new Event('list-page-ui-ready'));
document.dispatchEvent(new Event('case-detail-ui-ready'));
