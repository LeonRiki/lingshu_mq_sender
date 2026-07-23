import React, { memo, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import './editor-ui.jsx';
import { Alert, Badge, Button, Checkbox, ConfigProvider, DatePicker, Drawer, Dropdown, Flex, Input, Menu, message, Modal, Popconfirm, Popover, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload } from 'antd';
import { Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, getBezierPath } from '@xyflow/react';
import {
  ApiOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  BookOutlined,
  BranchesOutlined,
  CheckCircleFilled,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
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
  UnorderedListOutlined
} from '@ant-design/icons';
const { Title, Text } = Typography;
const listActionButtonTheme = { components: { Button: { iconGap: 4 } } };

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

function emitListToolbarChange(type, value) {
  document.dispatchEvent(new CustomEvent('list-toolbar-change', { detail: { type, value } }));
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
      width: 200,
      sorter: true,
      sortOrder: data.sort?.field === 'name' ? data.sort.order : null,
      render: (_, record) => <div className={`case-name-cell ${record.note ? '' : 'no-note'}`}><Button type="link" className="table-title case-name-link" onClick={event => { event.stopPropagation(); emitListToolbar('open-case', { id: record.id }); }}>{record.name}</Button>{record.note ? <Text type="secondary" className="list-table-note">{record.note}</Text> : null}</div>
    },
    { title: '业务场景', dataIndex: 'businessScenario', width: 120, responsive: ['lg'], render: value => value ? <Tag color="green" variant="outlined">{value}</Tag> : <Text type="secondary">-</Text> },
    { title: '触发消息', dataIndex: 'input', ellipsis: true, render: renderTriggerMessages },
    { title: 'TagList', dataIndex: 'tags', width: 200, render: tags => { const values = Array.isArray(tags) ? tags : []; const title = values.join('、'); return values.length ? <Tooltip title={title}><div className="list-table-tags">{values.map(value => <Tag key={value} color="blue" variant="outlined">{value}</Tag>)}</div></Tooltip> : <Text type="secondary">-</Text>; } },
    { title: '请求次数', dataIndex: 'batchCount', width: 76, align: 'center', render: value => value },
    { title: '创建日期', dataIndex: 'createdAt', width: 168, responsive: ['xl'], sorter: true, sortOrder: data.sort?.field === 'createdAt' ? data.sort.order : null },
    { title: '更新时间', dataIndex: 'updatedAt', width: 168, responsive: ['xl'], sorter: true, sortOrder: data.sort?.field === 'updatedAt' ? data.sort.order : null },
    { title: '操作', key: 'actions', width: 1, onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }), onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_, record) => <ConfigProvider theme={listActionButtonTheme}><Space size={4}><Button type="link" size="small" icon={<EditOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('open-case', { id: record.id }); }}>编辑</Button><Button type="link" size="small" icon={<CopyOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('duplicate-case', { id: record.id }); }}>复制</Button><Button type="link" size="small" icon={<SendOutlined />} onClick={event => { event.stopPropagation(); emitListToolbar('send-case', { id: record.id }); }}>发送</Button><Popconfirm title="确定删除该测试用例吗？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => emitListToolbar('delete-case', { id: record.id, confirmed: true })}><Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={event => event.stopPropagation()}>删除</Button></Popconfirm></Space></ConfigProvider> }
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
    <Table className="ant-list-table" size="middle" rowKey="id" columns={tableColumns} dataSource={data.items} tableLayout="auto" showSorterTooltip={{ target: 'sorter-icon' }} scroll={{ y: 'calc(100vh - 224px)' }} onChange={(_, __, sorter, extra) => { if (extra.action === 'sort') emitListToolbar('set-case-sort', { field: sorter.field, order: sorter.order }); }} rowSelection={{ selectedRowKeys: data.selectedIds, onChange: keys => emitListToolbar('set-case-selection', { ids: keys, pageIds: data.items.map(item => item.id) }) }} pagination={{ current: data.pageNo, pageSize: data.pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [15, 20, 50, 100], showTotal: total => `共 ${total} 条`, onChange: (pageNo, pageSize) => emitListToolbar('set-case-page', { pageNo, pageSize }) }} />
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

function DbSettingsDialog({ data }) {
  const configs = data.configs || [];
  const selectedId = data.selectedConfigId || configs[0]?.id || '__new__';
  const selected = selectedId === '__new__' ? null : configs.find(config => config.id === selectedId);
  const emptyForm = { name: '', host: '', port: 5432, database: '', user: '', password: '' };
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    setForm(selected ? { ...selected, password: '' } : emptyForm);
  }, [selectedId, data.open]);
  const setField = key => event => setForm(current => ({ ...current, [key]: event?.target ? event.target.value : event }));
  const menuItems = [...configs.map(config => ({ key: config.id, label: config.name })), { type: 'divider' }, { key: '__new__', icon: <PlusOutlined />, label: '新增数据库配置' }];
  const complete = form.name && form.host && form.port && form.database && form.user && (form.password || selected?.hasPassword);
  return <Modal open={data.open} centered title="数据库配置" width={820} onCancel={() => emitListToolbar('close-db-settings')} footer={null} destroyOnHidden>
    <Flex className="mq-settings-layout" gap={16}>
      <aside className="mq-settings-nav"><Menu mode="inline" selectedKeys={[selectedId]} items={menuItems} onClick={({ key }) => emitListToolbar('select-db-config', { value: key })} /></aside>
      <section className="mq-settings-form">
        <Flex justify="space-between" align="center">
          <Title level={5} style={{ margin: 0 }}>{selectedId === '__new__' ? '新增数据库配置' : '数据库配置'}</Title>
          <Space>
            <Button disabled={!selected?.id} loading={data.testing} onClick={() => emitListToolbar('test-db-config', { configId: selected.id })}>测试连接</Button>
            <Button type="primary" disabled={!complete} onClick={() => emitListToolbar('save-db-config', { config: { ...form, id: selectedId === '__new__' ? undefined : selectedId } })}>保存配置</Button>
          </Space>
        </Flex>
        <div className="mq-config-grid">
          <label>配置名称<Input value={form.name} onChange={setField('name')} /></label>
          <label>Host<Input value={form.host} onChange={setField('host')} /></label>
          <label>Port<Input value={form.port} onChange={setField('port')} /></label>
          <label>Database<Input value={form.database} onChange={setField('database')} /></label>
          <label>User<Input value={form.user} onChange={setField('user')} /></label>
          <label>Password<Input.Password value={form.password} onChange={setField('password')} placeholder={selected?.hasPassword ? '已配置，留空不修改' : ''} /></label>
        </div>
      </section>
    </Flex>
  </Modal>;
}

function DbConversationListPage({ data }) {
  const filters = data.filters || {};
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const rangeValue = filters.startTime || filters.endTime ? [
    filters.startTime ? dayjs(filters.startTime) : null,
    filters.endTime ? dayjs(filters.endTime) : null
  ] : null;
  const renderDbMessageText = value => value === null ? 'null' : String(value || '-');
  const disabledDate = (currentDate, info) => {
    if (!info?.from) return false;
    const diff = Math.abs(currentDate.startOf('day').diff(info.from.startOf('day'), 'day'));
    return diff > 6;
  };
  const renderMessageSummary = values => {
    const messages = Array.isArray(values) ? values : [];
    const summaryLines = messages
      .map(renderDbMessageText)
      .map(value => value.replace(/\s*[\r\n]+\s*/g, ' ').trim())
      .filter(value => value && value !== '-');
    const visibleLines = summaryLines.slice(0, 2);
    const tooltipLines = summaryLines.slice(0, 8);
    return <Tooltip title={<div className="db-message-summary-tooltip">
      {tooltipLines.length ? tooltipLines.map((line, index) => <div key={`${index}-${line}`} className="db-message-summary-tooltip-line">{line}</div>) : <div className="db-message-summary-tooltip-line">-</div>}
      <div className="db-message-summary-tooltip-count">共 {summaryLines.length} 条</div>
    </div>}><span className="list-table-input db-message-summary">
      {visibleLines.length ? visibleLines.map((line, index) => <span key={`${index}-${line}`} className="db-message-summary-line">{line}</span>) : <span className="db-message-summary-line">-</span>}
      <span className="db-message-summary-count">共 {summaryLines.length} 条</span>
    </span></Tooltip>;
  };
  const columns = [
    { title: '工作流ID', dataIndex: 'workflowId', width: 120, fixed: 'left', render: value => <Text strong>{value}</Text> },
    { title: '学员昵称', dataIndex: 'friendNick', width: 140, ellipsis: true, render: value => <Text className="list-table-input" ellipsis={{ tooltip: value || '-' }}>{value || '-'}</Text> },
    { title: 'Conversation ID', dataIndex: 'conversationId', width: 260, fixed: 'left', ellipsis: true, render: value => <Text className="list-table-input" ellipsis={{ tooltip: value }}>{value}</Text> },
    { title: '消息摘要', dataIndex: 'messageSummary', render: renderMessageSummary },
    { title: '状态', dataIndex: 'hasError', width: 120, render: (_, record) => record.hasError ? <Tooltip title={record.errorSummary}><Tag color="red">有错误</Tag></Tooltip> : <Tag color="green">正常</Tag> },
    { title: '消息数', dataIndex: 'messageCount', width: 84, align: 'center' },
    { title: '最近消息时间', dataIndex: 'lastMessageAt', width: 190, render: value => <Text>{value || '-'}</Text> },
    { title: '操作', key: 'actions', width: 184, render: (_, record) => <Space size={0}><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => emitListToolbar('open-db-conversation', { workflowId: record.workflowId, conversationId: record.conversationId })}>查看详情</Button><Button type="link" size="small" onClick={() => emitListToolbar('open-db-conversation-variables', { workflowId: record.workflowId, conversationId: record.conversationId })}>查看变量</Button></Space> }
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
    ? { badge: 'success', action: '断开连接', event: 'disconnect-db', title: '数据库已连接' }
    : connectionStatus === 'error'
      ? { badge: 'error', action: '重新连接', event: 'connect-db', title: connection.errorMessage || '数据库连接异常' }
      : { badge: 'default', action: '建立连接', event: 'connect-db', title: '数据库未连接' };
  return <div className="db-record-page">
    <div className="db-record-toolbar">
      <div className="db-filter-grid">
        <div className="db-filter-field"><span><b>*</b>工作流 ID</span><Input className="db-filter-control" allowClear value={filters.workflowId} onChange={event => emitListToolbarChange('db-workflow-id', event.target.value)} placeholder="请输入工作流ID" /></div>
        <div className="db-filter-field"><span>学员昵称</span><Input className="db-filter-control" allowClear value={filters.friendNick} onChange={event => emitListToolbarChange('db-friend-nick', event.target.value)} placeholder="请输入学员昵称" /></div>
        <div className="db-filter-field"><span>Conversation ID</span><Input className="db-filter-control" allowClear value={filters.conversationId} onChange={event => emitListToolbarChange('db-conversation-id', event.target.value)} placeholder="请输入Conversation ID" /></div>
        <div className="db-filter-field"><span>消息摘要</span><Input className="db-filter-control" allowClear value={filters.keyword} onChange={event => emitListToolbarChange('db-keyword', event.target.value)} placeholder="请输入消息摘要关键词" /></div>
        <div className="db-filter-field"><span>状态</span><Select className="db-filter-control" value={filters.hasError} onChange={value => emitListToolbarChange('db-has-error', value)} options={[{ value: '', label: '全部状态' }, { value: 'true', label: '有错误节点' }, { value: 'false', label: '无错误节点' }]} /></div>
        <div className="db-filter-field"><span>时间范围</span><DatePicker.RangePicker className="db-filter-control" format="YYYY-MM-DD" value={rangeValue} disabledDate={disabledDate} onChange={(_, values) => emitListToolbarChange('db-time-range', values)} /></div>
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
          <Button type="primary" icon={<DatabaseOutlined />} onClick={() => emitListToolbar('query-db-conversations')}>查询</Button>
        </Space>
      </div>
    </div>
    <div className="db-record-list-header"><div className="db-record-list-heading"><span className="db-record-list-title">数据列表</span>{data.queried ? <span className="db-record-total">共 {data.total || 0} 条</span> : null}</div><Space size={8}><Tooltip title={connectionMeta.title}><Space.Compact className="db-connection-control"><Button><Badge status={connectionMeta.badge} text={connection.name || '未配置数据库'} /></Button><Button loading={data.connectionChanging} disabled={!connection.configId} onClick={() => emitListToolbar(connectionMeta.event)}>{connectionMeta.action}</Button></Space.Compact></Tooltip><Button icon={<SettingOutlined />} onClick={() => emitListToolbar('open-db-settings')}>数据库配置</Button><Tooltip title="按当前筛选条件刷新"><Button icon={<ReloadOutlined />} aria-label="按当前筛选条件刷新" onClick={() => emitListToolbar('refresh-db-conversations')} /></Tooltip></Space></div>
    {!data.queried && !data.loading ? <div className="db-record-empty"><Text type="secondary">请设置筛选条件后点击查询</Text></div> : <Table className="ant-list-table db-record-table" size="middle" rowKey="id" columns={columns} dataSource={data.items || []} loading={data.loading} tableLayout="fixed" scroll={{ y: 'calc(100vh - 344px)', x: 1260 }} pagination={{ current: data.pageNo, pageSize: data.pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`, onChange: (pageNo, pageSize) => emitListToolbar('set-db-page', { pageNo, pageSize }) }} />}
    <DbSettingsDialog data={{ open: data.settingsOpen, configs: data.configs, selectedConfigId: data.selectedConfigId, testing: data.testing }} />
    <Modal open={saveFilterOpen} title="保存筛选条件" okText="保存" cancelText="取消" onCancel={() => { setSaveFilterOpen(false); setFilterName(''); }} onOk={saveCurrentFilter} destroyOnHidden>
      <Input autoFocus value={filterName} onChange={event => setFilterName(event.target.value)} onPressEnter={saveCurrentFilter} placeholder="请输入筛选条件名称" maxLength={40} />
    </Modal>
  </div>;
}

function renderJsonCode(value) {
  const json = JSON.stringify(value ?? null, null, 2);
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

function DbNodeDrawer({ node, onClose, loading = false }) {
  const jsonBlock = (title, value) => <section className="db-node-json"><Text strong>{title}</Text><pre><code>{renderJsonCode(value)}</code></pre></section>;
  const isSetVariable = String(node?.nodeType || '').toLowerCase() === 'set_variable';
  const executionContent = !node ? null : loading ? <Flex justify="center" style={{ padding: '48px 0' }}><Spin description="正在加载节点执行详情" /></Flex> : !node.detailsLoaded && node.id ? <Text type="secondary">节点执行详情暂不可用</Text> : !node.id ? <Text type="secondary">该节点未参与本次执行</Text> : <Flex vertical gap={12}>
    <Space wrap><Tag>{node.nodeType || 'node'}</Tag><Tag color={node.status === 'SUCCESS' ? 'green' : 'red'}>{node.status || '-'}</Tag><Text type="secondary">{node.durationMs || 0} ms</Text></Space>
    {node.errorMessage ? <Alert type="error" message={node.errorMessage} /> : null}
    {jsonBlock('Outputs', node.outputs)}
    {jsonBlock('Inputs', node.inputs)}
    {jsonBlock('Logs', node.logs)}
    {isSetVariable ? jsonBlock('Before Snapshot', node.beforeSnapshot) : null}
    {isSetVariable ? jsonBlock('After Snapshot', node.afterSnapshot) : null}
  </Flex>;
  return <Drawer open={Boolean(node)} width={520} title={node?.nodeName || node?.nodeId || '节点详情'} onClose={onClose} destroyOnHidden>
    {node ? <Tabs className="db-node-drawer-tabs" defaultActiveKey="execution" items={[
      { key: 'execution', label: '当前节点执行记录', children: executionContent },
      { key: 'config', label: '当前节点参数配置', children: jsonBlock('节点参数配置', node.nodeConfig) }
    ]} /> : null}
  </Drawer>;
}

function renderDbMessageText(value) {
  return value === null ? 'null' : String(value || '-');
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
      </> : group.items.map(action => {
        return <span key={action.id} className="db-message-action db-message-action-http-row">{action.nodeName || action.actionLabel || 'HTTP请求'}</span>;
      })}
    </span>)}
  </span>;
}

function DbConversationDetailPage({ data }) {
  const detail = data.detail;
  const [drawerNode, setDrawerNode] = useState(null);
  const [messageOrder, setMessageOrder] = useState('asc');
  const [showActions, setShowActions] = useState(false);
  const [flowInstance, setFlowInstance] = useState(null);
  const [flowZoom, setFlowZoom] = useState(0.8);
  const [nodePositionOverrides, setNodePositionOverrides] = useState({});
  const [activeExecutionIndex, setActiveExecutionIndex] = useState(0);
  const flowPanelRef = useRef(null);
  const messageFlowRef = useRef(null);
  const historicalFocusNodeRef = useRef('');
  const messageScrollKeyRef = useRef('');
  useEffect(() => {
    setNodePositionOverrides({});
    setShowActions(false);
    historicalFocusNodeRef.current = '';
  }, [data.activeWorkflowId, data.activeConversationId]);
  useEffect(() => {
    setActiveExecutionIndex(0);
  }, [data.selectedTriggerMessageId, detail?.selectedTriggerMessageId]);
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
  if (data.detailLoading) return <div className="db-record-detail-loading"><Spin description="正在加载会话详情" /></div>;
  if (!detail) return <div className="db-record-empty"><Text type="secondary">暂无详情</Text></div>;
  const messages = detail.messages || [];
  const selectedTrigger = data.selectedTriggerMessageId || detail.selectedTriggerMessageId || '';
  const executions = detail.executionsByTrigger?.[selectedTrigger] || [];
  const executionStepIndex = Math.min(Math.max(activeExecutionIndex, 0), Math.max(executions.length - 1, 0));
  const activeExecution = executions[executionStepIndex] || null;
  const graph = detail.workflowGraph || { nodes: [], edges: [] };
  const messageGroups = [];
  const messageGroupMap = new Map();
  messages.forEach(message => {
    const triggerMessageId = message.triggerMessageId || message.id;
    if (!messageGroupMap.has(triggerMessageId)) {
      const group = { triggerMessageId, user: null, assistant: null, actions: [] };
      messageGroupMap.set(triggerMessageId, group);
      messageGroups.push(group);
    }
    const group = messageGroupMap.get(triggerMessageId);
    if (String(message.role).toUpperCase() === 'USER') group.user = group.user || message;
    else if (String(message.role).toUpperCase() === 'ASSISTANT') group.assistant = group.assistant || message;
    else if (String(message.role).toUpperCase() === 'ACTION') group.actions.push(message);
  });
  messageGroups.sort((left, right) => {
    const leftTime = left.user?.messageTimestamp || left.assistant?.messageTimestamp || '';
    const rightTime = right.user?.messageTimestamp || right.assistant?.messageTimestamp || '';
    return String(leftTime).localeCompare(String(rightTime));
  });
  const orderedMessageGroups = messageOrder === 'desc' ? [...messageGroups].reverse() : messageGroups;
  const currentRawNodes = graph.nodes || [];
  const historicalRuntime = detail.historicalNodesByTrigger?.[selectedTrigger] || { nodes: [], edges: [] };
  const historicalRawNodes = (historicalRuntime.nodes || []).map(item => ({ ...item.node, __historical: item }));
  const rawNodes = [...currentRawNodes, ...historicalRawNodes];
  const nodeById = new Map(rawNodes.map(node => [node.id, node]));
  const executionMap = new Map(executions.map(item => [item.nodeId, item]));
  const errorTriggerMessageIds = new Set(Object.entries(detail.executionsByTrigger || {})
    .filter(([, triggerExecutions]) => triggerExecutions.some(execution => !isDbExecutionSuccess(execution.status) || execution.errorMessage || execution.errorClass || execution.errorCode))
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
      <aside ref={messageFlowRef} className="db-message-flow">
        <div className="db-message-flow-toolbar">
          <Space size={4}><span className="db-message-flow-title">消息记录</span><Button type="link" size="small" onClick={() => emitListToolbar('open-db-conversation-variables', { workflowId: data.activeWorkflowId, conversationId: data.activeConversationId })}>会话变量</Button><span className="db-message-action-switch"><span>展示动作</span><Switch size="small" checked={showActions} onChange={setShowActions} /></span></Space>
          <Tooltip title={messageOrder === 'asc' ? '切换为倒序' : '切换为正序'}><Button className="db-message-sort-button" type="text" shape="circle" size="small" icon={messageOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />} aria-label={messageOrder === 'asc' ? '切换为倒序' : '切换为正序'} onClick={() => setMessageOrder(order => order === 'asc' ? 'desc' : 'asc')} /></Tooltip>
        </div>
        {orderedMessageGroups.map(group => {
          const selected = group.triggerMessageId === selectedTrigger;
          const hasError = errorTriggerMessageIds.has(group.triggerMessageId);
          const userMessage = group.user || group.assistant;
          const assistantMessage = group.assistant;
          const unprocessed = userMessage?.processed === false;
          const noReply = !unprocessed && userMessage?.hasReplyAction === false;
          return <button key={group.triggerMessageId} className={`db-message-item conversation ${selected ? 'selected' : ''}`} onClick={() => emitListToolbar('select-db-message', { triggerMessageId: group.triggerMessageId })}>
            <span className="db-message-section">
              <span className="db-message-meta"><span className="db-message-role">{detail.friendNick || '学员消息'}</span><span className="db-message-time">{userMessage?.messageTimestamp}</span>{unprocessed || noReply || hasError ? <span className="db-message-status-tags">{unprocessed ? <Tag color="gold">未处理</Tag> : null}{noReply ? <Tag color="default">不回复</Tag> : null}{hasError ? <Tag color="red">有错误</Tag> : null}</span> : null}</span>
              <span className="db-message-content">{renderDbMessageText(userMessage?.content)}</span>
            </span>
            {showActions ? <DbConversationActionGroups actions={group.actions} /> : null}
            {assistantMessage && !noReply ? <span className="db-message-ai-reply">
              <span className="db-message-meta"><span className="db-message-role">AI回复</span>{assistantMessage?.messageTimestamp ? <span className="db-message-time">{assistantMessage.messageTimestamp}</span> : null}</span>
              <span className="db-message-content">{assistantMessage?.content === '' ? '\u00a0' : renderDbMessageText(assistantMessage?.content)}</span>
            </span> : null}
          </button>;
        })}
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
            <Dropdown menu={{ items: executionMenuItems, selectedKeys: [String(executionStepIndex)], onClick: ({ key }) => focusExecutionStep(Number(key)) }} trigger={['click']}><Tooltip title="选择执行节点"><Button className="db-flow-step-menu-button" icon={<UnorderedListOutlined />} aria-label="选择执行节点" /></Tooltip></Dropdown>
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
    <DbNodeDrawer node={drawerNode?.id && data.nodeExecutionDetails?.[drawerNode.id] ? { ...drawerNode, ...data.nodeExecutionDetails[drawerNode.id] } : drawerNode} loading={data.nodeExecutionLoadingId === drawerNode?.id} onClose={() => setDrawerNode(null)} />
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
  return <>{data.page === 'detail' ? <DbConversationDetailPage data={data} /> : <DbConversationListPage data={data} />}<DbConversationVariablesModal data={data} /></>;
}

function AppTabs({ activeView }) {
  return <Tabs activeKey={activeView} onChange={value => emitListToolbar('switch-view', { value })} items={[{ key: 'cases', label: '测试用例' }, { key: 'records', label: '测试记录' }, { key: 'dbRecords', label: '会话记录查询（DB）' }, { key: 'labels', label: '标签与场景' }]} />;
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

function MqSettingsDialog({ data }) {
  const configs = data.configs || [];
  const [selectedId, setSelectedId] = useState(data.selectedId || configs[0]?.id || '__new__');
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
    selectConfig(data.selectedId || configs[0]?.id || '__new__');
  }, [data.open, data.selectedId, configs]);
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
  const menuItems = [...configs.map(config => ({ key: config.id, label: config.name })), { type: 'divider' }, { key: '__new__', icon: <PlusOutlined />, label: '新增 MQ 配置' }];
  return <Modal open={data.open} centered title="MQ 配置" width={880} onCancel={() => emitListToolbar('close-mq-settings')} footer={null} destroyOnHidden>
    <Flex className="mq-settings-layout" gap={16}>
      <aside className="mq-settings-nav"><Menu mode="inline" selectedKeys={[selectedId]} items={menuItems} onClick={({ key }) => selectConfig(key)} /></aside>
      <section className="mq-settings-form">
        <Flex justify="space-between" align="center"><Title level={5} style={{ margin: 0 }}>{selectedId === '__new__' ? '新增 MQ 配置' : 'MQ 配置'}</Title><Space><Button type="link" onClick={copyConfigText}>复制配置信息</Button><Button type="primary" onClick={() => emitListToolbar('save-mq-config', { config: { ...form, id: selectedId === '__new__' ? undefined : selectedId } })}>保存配置</Button></Space></Flex>
        <div className="mq-config-grid">
          <label>MQ 配置名称<Input value={form.name} onChange={setField('name')} /></label>
          <label>网关地址<Input value={form.gatewayUrl} onChange={setField('gatewayUrl')} placeholder="http://host:port" /></label>
          <label>App ID<Input value={form.appId} onChange={setField('appId')} /></label>
          <label>Topic<Input value={form.topic} onChange={setField('topic')} /></label>
          <label>Producer Group<Input value={form.producerGroup} onChange={setField('producerGroup')} /></label>
          <label>NameServer<Input value={form.nameServer} onChange={setField('nameServer')} /></label>
          <label>Message Type<Input value={form.messageType} onChange={setField('messageType')} /></label>
          <label>Secret Key<Input.Password value={form.secretKey} onChange={setField('secretKey')} placeholder={form.hasSecretKey ? '已配置，留空不修改' : ''} /></label>
        </div>
        <label className="mq-config-parser">解析配置文本<Input.TextArea value={parseText} onChange={event => setParseText(event.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} /><Flex justify="space-between" align="center"><Text type="danger">{parseError}</Text><Button onClick={parseConfigText}>解析并填入</Button></Flex></label>
      </section>
    </Flex>
  </Modal>;
}

function MqSettingsButton({ visible }) {
  return visible ? <Tooltip title="MQ 发送配置"><Button type="text" icon={<SettingOutlined />} aria-label="MQ 发送配置" onClick={() => emitListToolbar('open-mq-settings')}>MQ发送配置</Button></Tooltip> : null;
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
      {check?.updateAvailable ? <Flex vertical gap={24}><Flex vertical gap={12}><Text type="secondary" className="update-source-section-label">选择更新源</Text><Radio.Group className="update-source-grid" value={sourceKey} onChange={event => setSourceKey(event.target.value)}>{sourceStates.map(source => <Radio key={source.key} className={`update-source-card ${sourceKey === source.key ? 'is-selected' : ''}`} value={source.key} disabled={applying || !source.ok || !source.updateAvailable}><Flex className="update-source-card-content" align="center" justify="space-between" gap={16}><Space className="update-source-card-main" size={16}><span className="update-source-brand-icon"><UpdateSourceIcon sourceKey={source.key} /></span><Flex vertical gap={0}><Text strong className="update-source-name">{source.label}</Text><Text type="secondary" className="update-source-version">{source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本'}</Text></Flex></Space>{sourceKey === source.key ? <CheckCircleFilled className="update-source-check" aria-hidden="true" /> : <span className="update-source-check update-source-check-empty" aria-hidden="true" />}</Flex></Radio>)}</Radio.Group></Flex><Text type="secondary" className="update-source-hint">将从 {selectedSource?.label || '-'} 更新至 v{targetVersion}。更新前会自动备份，更新完成后服务会自动重启。</Text><Flex className="update-dialog-actions" justify="flex-end" gap={8}><Button disabled={applying} onClick={() => emitListToolbar('close-update-dialog')}>取消</Button><Popconfirm title="更新会先备份源码，随后重启本机服务。确认继续？" okText="立即更新" cancelText="取消" onConfirm={() => emitListToolbar('apply-online-update', { sourceKey })}><Button type="primary" loading={applying} disabled={!sourceKey || applying} icon={<ReloadOutlined />}>立即更新</Button></Popconfirm></Flex></Flex> : null}
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
    <Flex className="antd-detail-header" align="center" justify="flex-start" gap={12}>
      <Tooltip title="返回会话记录列表">
        <Button type="text" shape="circle" icon={<ArrowLeftOutlined />} aria-label="返回会话记录列表" onClick={() => emitListToolbar('back-db-conversations')} />
      </Tooltip>
      <Flex className="antd-detail-summary" vertical gap={2}>
        <Title level={5} style={{ margin: 0 }}>{title}</Title>
        {detail?.workflowName ? <Text type="secondary">{detail.workflowName}</Text> : null}
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
let labelManagementRoot;
let sendDialogRoot;
let importCaseRoot;
let batchEditRoot;
let appendRecordMessageRoot;
let mqSettingsButtonRoot;
let mqSettingsRoot;
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
  const labelManagementHost = document.getElementById('labelManagementApp');
  if (!tabsHost || !caseHost || !recordHost || !dbRecordsHost || !labelManagementHost) return;
  appTabsRoot ||= createRoot(tabsHost);
  caseListRoot ||= createRoot(caseHost);
  recordListRoot ||= createRoot(recordHost);
  dbRecordsRoot ||= createRoot(dbRecordsHost);
  labelManagementRoot ||= createRoot(labelManagementHost);
  appTabsRoot.render(<ConfigProvider componentSize="middle"><AppTabs activeView={data.activeView} /></ConfigProvider>);
  caseListRoot.render(<ConfigProvider componentSize="middle"><CaseListPage data={data.cases} /></ConfigProvider>);
  recordListRoot.render(<ConfigProvider componentSize="middle"><RecordListPage data={data.records} /></ConfigProvider>);
  dbRecordsRoot.render(<ConfigProvider componentSize="middle"><DbRecordsPage data={data.dbRecords} /></ConfigProvider>);
  labelManagementRoot.render(<ConfigProvider componentSize="middle"><LabelManagementPage data={data.management} /></ConfigProvider>);
};

window.renderSendDialog = data => {
  const host = document.getElementById('sendDialogApp');
  if (!host) return;
  sendDialogRoot ||= createRoot(host);
  sendDialogRoot.render(<ConfigProvider componentSize="middle"><SendDialog data={data} /></ConfigProvider>);
};

window.renderMqSettingsButton = data => {
  const host = document.getElementById('mqSettingsApp');
  if (!host) return;
  mqSettingsButtonRoot ||= createRoot(host);
  mqSettingsButtonRoot.render(<ConfigProvider componentSize="middle"><MqSettingsButton visible={data.visible} /></ConfigProvider>);
};

window.renderMqSettings = data => {
  const host = document.getElementById('mqSettingsDialog') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mqSettingsDialog' }));
  mqSettingsRoot ||= createRoot(host);
  mqSettingsRoot.render(<ConfigProvider componentSize="middle"><MqSettingsDialog data={data} /></ConfigProvider>);
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
