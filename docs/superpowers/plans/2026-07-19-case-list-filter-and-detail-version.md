# 测试用例筛选与详情版本号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将测试用例文本搜索限制为场景名称和触发消息，新增全部标签匹配筛选，并在两类详情页隐藏版本号。

**Architecture:** 列表筛选状态继续由 `web/app.js` 持有，`web/detail-ui.jsx` 只呈现 Ant Design 筛选控件并发出既有工具栏事件。详情页版本号使用已存在的 body 状态类控制 CSS 可见性，不改变更新逻辑。

**Tech Stack:** 原生 JavaScript、React 19、Ant Design 6、CSS、esbuild。

---

### Task 1: 测试用例筛选状态与匹配规则

**Files:**
- Modify: `v1/web/app.js:27-29,430-478,1899-1908`

- [ ] **Step 1: 写入失败的筛选契约检查**

在本地临时 Node 脚本中定义两个用例：一个仅业务场景命中、一个仅触发消息命中；目标规则要求前者不匹配文本搜索，后者匹配。再定义带 `['标签A', '标签B']` 的用例，要求选择 `['标签A', '标签B']` 时匹配，选择含不存在标签时不匹配。

- [ ] **Step 2: 运行契约检查并确认现有行为不满足**

Run: `node --test test/case-list-filter-contract.test.js`

Expected: FAIL，原因是现有搜索仍将业务场景和标签加入搜索文本，且没有标签多选状态。

- [ ] **Step 3: 实现最小筛选状态与规则**

在 `state` 增加 `caseTagFilters: []`。在 `renderCaseList()` 中仅将 `c.meta.name` 与 `previewCaseInputs(c)` 拼接为搜索文本，并增加：

```js
const matchesTags = state.caseTagFilters.every(tag => (c.message.tagList || []).includes(tag));
return (!query || hay.includes(query)) && (!scenarioFilter || c.meta.businessScenario === scenarioFilter) && matchesTags;
```

在工具栏事件中处理 `case-tags`，写入数组、重置页码并重新渲染。

- [ ] **Step 4: 运行契约检查确认通过**

Run: `node --test test/case-list-filter-contract.test.js`

Expected: PASS。

### Task 2: 标签多选筛选控件

**Files:**
- Modify: `v1/web/detail-ui.jsx:50-63`
- Modify: `v1/web/app.js:401-416,453-476`

- [ ] **Step 1: 将标签筛选状态投影到列表数据**

在 `renderListToolbars()` 的测试用例数据中传递 `tags: labelNames('userTags')` 与 `tagFilters: state.caseTagFilters`；在 `renderCaseList()` 的 `caseListData` 中传递相同字段。

- [ ] **Step 2: 实现 Ant Design 多选下拉**

在业务场景下拉与搜索框之间添加：

```jsx
<Select
  aria-label="按标签筛选"
  mode="multiple"
  allowClear
  value={data.tagFilters}
  onChange={values => emitListToolbarChange('case-tags', values)}
  options={data.tags.map(value => ({ value, label: value }))}
  placeholder="筛选标签"
  style={{ width: 220 }}
/>
```

- [ ] **Step 3: 构建并检查组件用法**

Run: `npm run build && antd lint web/detail-ui.jsx --format json`

Expected: 构建成功；不新增 Ant Design 弃用或使用问题。

### Task 3: 详情页版本号可见性

**Files:**
- Modify: `v1/web/styles.css:118-136`

- [ ] **Step 1: 添加详情页可见性规则**

添加：

```css
.case-detail-open .app-version,
.record-detail-open .app-version {
  display: none;
}
```

- [ ] **Step 2: 验证样式与构建**

Run: `git diff --check && npm run build`

Expected: 无空白错误，构建成功。

### Task 4: 最终验证与提交

**Files:**
- Modify: `v1/web/app.js`
- Modify: `v1/web/detail-ui.jsx`
- Modify: `v1/web/detail-ui.js`
- Modify: `v1/web/styles.css`
- Test: `v1/test/case-list-filter-contract.test.js`

- [ ] **Step 1: 运行筛选契约与现有服务测试**

Run: `node --test test/case-list-filter-contract.test.js test/mq-gateway.test.js`

Expected: 全部通过。

- [ ] **Step 2: 提交本地修改**

```bash
git add v1/web/app.js v1/web/detail-ui.jsx v1/web/detail-ui.js v1/web/styles.css v1/test/case-list-filter-contract.test.js
git commit -m "feat(v1): 增加测试用例标签筛选"
```
