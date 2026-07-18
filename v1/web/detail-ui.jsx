import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './editor-ui.jsx';
import { Alert, Badge, Button, Checkbox, ConfigProvider, Dropdown, Flex, Input, Menu, message, Modal, Popconfirm, Popover, Radio, Select, Space, Table, Tabs, Tag, Tooltip, Typography, Upload } from 'antd';
import {
  ArrowLeftOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  GithubOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined
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
        <Input value={data.search} onChange={event => emitListToolbarChange('case-search', event.target.value)} placeholder="搜索名称 / Tag / 类型" style={{ width: 300 }} />
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
    { title: 'Conversation_id', dataIndex: 'conversationId', width: 180, ellipsis: true, render: value => <Text className="list-table-input">{value || '-'}</Text> },
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

function AppTabs({ activeView }) {
  return <Tabs activeKey={activeView} onChange={value => emitListToolbar('switch-view', { value })} items={[{ key: 'cases', label: '测试用例' }, { key: 'records', label: '测试记录' }, { key: 'labels', label: '标签与场景' }]} />;
}

function LabelManagementPage({ data }) {
  const [activeKey, setActiveKey] = useState('userTags');
  const [search, setSearch] = useState('');
  const [selectedNames, setSelectedNames] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [target, setTarget] = useState(null);
  const [action, setAction] = useState('archive');
  const [replacement, setReplacement] = useState('');
  const isTag = activeKey === 'userTags';
  const label = isTag ? '用户标签' : '业务场景';
  const items = (data?.[activeKey] || []).filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const activeItems = (data?.[activeKey] || []).filter(item => item.status === 'active' && item.name !== target?.name);
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
    { title: '操作', key: 'actions', width: 220, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_, item) => <Space size={4}>{item.status === 'active' ? <Button type="link" size="small" onClick={() => emitListToolbar('manage-label-item', { labelType: activeKey, action: 'archive', name: item.name })}>归档</Button> : <Button type="link" size="small" onClick={() => emitListToolbar('manage-label-item', { labelType: activeKey, action: 'restore', name: item.name })}>恢复</Button>}{item.usageCount ? <Button type="link" size="small" onClick={() => { setTarget(item); setAction('replace'); }}>替换</Button> : null}<Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => { setTarget(item); setAction(item.usageCount ? 'archive' : 'delete'); }}>删除</Button></Space> }
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
    <Flex justify="space-between" align="center" gap={16} wrap>
      <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={`搜索${label}`} style={{ width: 300 }} />
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增{label}</Button>
    </Flex>
    <Tabs activeKey={activeKey} onChange={key => { setActiveKey(key); setSearch(''); setSelectedNames([]); }} items={[
      { key: 'userTags', label: '用户标签' },
      { key: 'businessScenarios', label: '业务场景' }
    ]} />
    <Table className="ant-list-table" size="middle" rowKey="name" columns={tableColumns} dataSource={items} tableLayout="auto" rowSelection={{ selectedRowKeys: selectedNames, onChange: setSelectedNames }} pagination={{ pageSize: 20, showSizeChanger: false, showTotal: total => `共 ${total} 条` }} />
    <Modal open={createOpen} centered title={`新增${label}`} onCancel={() => setCreateOpen(false)} footer={<Space><Button onClick={() => setCreateOpen(false)}>取消</Button><Button type="primary" disabled={!newName.trim()} onClick={create}>新增</Button></Space>}>
      <Input value={newName} onChange={event => setNewName(event.target.value)} placeholder={`输入${label}名称`} />
    </Modal>
    <Modal open={Boolean(target)} centered title={targetInUse ? `处理“${target?.name || ''}”` : `确认删除“${target?.name || ''}”`} onCancel={resetAction} footer={<Space><Button onClick={resetAction}>取消</Button>{targetInUse ? <Button type="primary" disabled={action === 'replace' && !replacement} onClick={() => requestAction(action)}>{action === 'archive' ? '归档' : action === 'replace' ? '替换' : replacementLabel}</Button> : <Button type="primary" danger onClick={() => requestAction('delete')}>删除</Button>}</Space>}>
      {targetInUse ? <Flex vertical gap={16}><Text>该项当前被 {target?.usageCount} 个测试用例使用。</Text><Radio.Group value={action} onChange={event => setAction(event.target.value)}><Flex vertical gap={12}><Radio value="archive">归档</Radio><Radio value="replace">替换为其他{label}</Radio><Radio value={replacementAction}>{replacementLabel}</Radio></Flex></Radio.Group>{action === 'replace' ? <Select value={replacement || undefined} onChange={setReplacement} options={activeItems.map(item => ({ value: item.name, label: item.name }))} placeholder={`选择替换后的${label}`} style={{ width: '100%' }} /> : null}</Flex> : <Text>确认删除“{target?.name}”吗？该项当前未被测试用例使用。</Text>}
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
  return sourceKey === 'github' ? <GithubOutlined aria-hidden="true" /> : <CloudServerOutlined aria-hidden="true" />;
}

function UpdateSourceLabel({ source }) {
  const detail = source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本';
  return <Space size={6}><UpdateSourceIcon sourceKey={source.key} /><span>{source.label}</span><Text type="secondary">{detail}</Text></Space>;
}

function UpdateDialog({ data }) {
  const status = data.status || {};
  const check = data.check;
  const [sourceKey, setSourceKey] = useState('');
  const release = check?.release;
  const sourceStates = check?.sources || (status.sources || []).map(source => ({ ...source, ok: null }));
  const selectableSources = sourceStates.filter(source => source.ok && source.updateAvailable);
  useEffect(() => {
    if (!data.open) return;
    setSourceKey(current => selectableSources.some(source => source.key === current) ? current : (selectableSources[0]?.key || ''));
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
    ? <Flex vertical gap={2} className="update-dialog-title"><Text type="success" strong>发现新版本</Text><Flex align="center" gap={8} wrap><Title level={4}>更新至 v{targetVersion}</Title><Text type="secondary">当前版本 v{currentVersion}</Text></Flex></Flex>
    : '在线更新';
  return <Modal open={data.open} centered title={modalTitle} width={720} onCancel={() => emitListToolbar('close-update-dialog')} footer={null} destroyOnHidden>
    <Flex vertical gap={16} className="update-dialog-content">
      {!check?.updateAvailable ? <Flex vertical gap={8}><Text strong>当前版本 {currentVersion}</Text><Space size={[4, 4]} wrap>{sourceStates.map(source => <Tag key={source.key} color={source.ok === false ? 'red' : source.ok ? 'blue' : 'default'} icon={<UpdateSourceIcon sourceKey={source.key} />}>{source.label} · {source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本'}</Tag>)}</Space></Flex> : null}
      {checkSummary}
      {release?.notes?.length ? <Flex vertical gap={4}><Text strong>更新说明</Text>{release.notes.map((note, index) => <Text key={`${note}-${index}`}>- {note}</Text>)}</Flex> : null}
      {check?.updateAvailable ? <Flex vertical gap={16}><Flex vertical gap={8}><Text strong>选择更新源</Text><Radio.Group className="update-source-grid" value={sourceKey} onChange={event => setSourceKey(event.target.value)}>{sourceStates.map(source => <Radio key={source.key} className={`update-source-card ${sourceKey === source.key ? 'is-selected' : ''}`} value={source.key} disabled={!source.ok || !source.updateAvailable}><Flex vertical gap={4}><Space size={8}><UpdateSourceIcon sourceKey={source.key} /><Text strong>{source.label}</Text></Space><Text type="secondary">{source.ok === false ? '暂不可用' : source.version ? `v${source.version}` : '未发现版本'}</Text></Flex></Radio>)}</Radio.Group></Flex><Text type="secondary" className="update-source-hint">将从 {selectedSource?.label || '-'} 更新至 v{targetVersion}。更新前会自动备份，更新完成后服务会自动重启。</Text><Flex className="update-dialog-actions" justify="flex-end" gap={8}><Button onClick={() => emitListToolbar('close-update-dialog')}>取消</Button><Popconfirm title="更新会先备份源码，随后重启本机服务。确认继续？" okText="立即更新" cancelText="取消" onConfirm={() => emitListToolbar('apply-online-update', { sourceKey })}><Button type="primary" disabled={!sourceKey} icon={<ReloadOutlined />}>立即更新</Button></Popconfirm></Flex></Flex> : null}
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
  return <Modal open centered title="批量修改测试用例" onCancel={onCancel} footer={<Space><Button onClick={onCancel}>取消</Button><Button type="primary" disabled={!changeScenario && !changeTags} onClick={() => onConfirm({ changeScenario, businessScenario, changeTags, tags })}>确定</Button></Space>}>
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

function DetailActions() {
  return (
    <Space wrap size={8}>
      <Button icon={<SaveOutlined />} onClick={() => emit('save')}>保存用例</Button>
      <Button type="primary" icon={<SendOutlined />} onClick={() => emit('send')}>通过MQ发送</Button>
    </Space>
  );
}

let headerRoot;
let actionsRoot;
let unsavedChangesRoot;
let appTabsRoot;
let caseListRoot;
let recordListRoot;
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
  const labelManagementHost = document.getElementById('labelManagementApp');
  if (!tabsHost || !caseHost || !recordHost || !labelManagementHost) return;
  appTabsRoot ||= createRoot(tabsHost);
  caseListRoot ||= createRoot(caseHost);
  recordListRoot ||= createRoot(recordHost);
  labelManagementRoot ||= createRoot(labelManagementHost);
  appTabsRoot.render(<ConfigProvider componentSize="middle"><AppTabs activeView={data.activeView} /></ConfigProvider>);
  caseListRoot.render(<ConfigProvider componentSize="middle"><CaseListPage data={data.cases} /></ConfigProvider>);
  recordListRoot.render(<ConfigProvider componentSize="middle"><RecordListPage data={data.records} /></ConfigProvider>);
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
