# MQ 发送 JSON 字段与生成规则

本文以 `server.js` 中真实 MQ 发送前调用的 `buildSnapshots()` 为准，记录当前 V1 实际发送的业务 JSON、字段来源与生成规则。

## 1. 发送 JSON 结构

每一条 MQ 请求的 `messageBody` 均为以下对象的 JSON 字符串：

```json
{
  "requestId": "ww12ab34cd_JingLing_12345678901234_1760000000000_1",
  "input": ["学员本次发送的消息"],
  "latestMsgTime": "2026-07-15 16:00:00",
  "weworkCorpId": "ww12ab34cd",
  "agentId": "testId",
  "addTime": "2026-07-15 16:00:00",
  "weworkAccount": "JingLing12Wang",
  "friendNick": "精灵王21",
  "friendExternalId": "Abcdefghijklmnop1234QrStUvWx",
  "tagList": ["标签 A", "标签 B"],
  "inputList": ["1688850000000000:老师历史消息"],
  "weworkAccountAlias": "汪洋老师",
  "friendRemoteId": "7881301234567890"
}
```

## 2. 字段定义与来源

| 字段 | 类型 | 含义 | 生成或取值规则 |
| --- | --- | --- | --- |
| `requestId` | string | 单条请求唯一标识 | 每个发送 JSON 均重新生成。格式为 `{weworkCorpId}_{随机名称}_{14 位随机数字}_{时间戳}_{本次发送序号}`。同一次多轮发送通过末尾序号保证不同。 |
| `input` | string[] | 本次请求发送的学员消息 | 取消息流中、当前发送间隔之后直到下一发送间隔之前的全部消息。 |
| `latestMsgTime` | string | 当前请求的最新消息时间 | 正常由编辑页生成时格式为 `YYYY-MM-DD HH:mm:ss`。首条取用例配置值或生成时当前时间；导入旧数据时会保留其原始首条格式。后续请求会在上一条时间上加本次发送间隔，并输出标准格式。 |
| `weworkCorpId` | string | 企业微信企业标识 | 每次“发送一个测试用例”时随机生成，格式为 `ww` 加 8 位十六进制字符。一次多轮发送内保持一致。 |
| `agentId` | string | Agent ID | 优先使用发送弹窗本次选择的 Agent ID；否则取用例保存的 Agent ID；再否则取全局默认 Agent ID。 |
| `addTime` | string | 会话添加时间 | 正常由编辑页生成时格式为 `YYYY-MM-DD HH:mm:ss`。取用例配置值；未配置时为生成时当前时间。 |
| `weworkAccount` | string | 老师企微账号 | 每次发送随机生成：随机名称加 2 位数字加随机姓氏后缀。一次多轮发送内保持一致。 |
| `friendNick` | string | 学员昵称 | 取会话属性或用例配置；未配置时从内置昵称池随机取值。同一个 `friendExternalId` 在一次多轮发送内固定为同一昵称。 |
| `friendExternalId` | string | 学员外部联系人标识 | 每次发送随机生成：16 位随机字母数字、4 位数字、8 位随机字母数字拼接。一次多轮发送内保持一致。 |
| `tagList` | string[] | 用户标签 | 默认取用例 TagList；会话属性中有 `tagList` 时覆盖。字符串值会按英文逗号、中文逗号、分号或换行切分。 |
| `inputList` | string[] | 本次消息前的历史消息 | 首条取用例保存的历史消息。后续请求会追加此前已发送的学员消息，格式为 `{friendRemoteId}:{消息内容}`。 |
| `weworkAccountAlias` | string | 老师企微账号别名 | 取会话属性或用例配置；未配置时取全局默认别名。同一个 `weworkCorpId` 在一次多轮发送内固定为同一别名。 |
| `friendRemoteId` | string | 学员远程标识 | 每次发送随机生成，格式为 `788130` 加 10 位数字。一次多轮发送内保持一致。 |

## 3. 消息流与请求拆分

消息流由“消息”和“发送间隔”组成：

```text
消息 A -> 发送间隔 50 秒 -> 消息 B、消息 C -> 发送间隔 40 秒 -> 消息 D
```

会生成 3 条 JSON：

1. 第 1 条：`input = [消息 A]`，立即发送，`delaySeconds = 0`。
2. 第 2 条：`input = [消息 B, 消息 C]`，等待 50 秒后发送。
3. 第 3 条：`input = [消息 D]`，等待 40 秒后发送。

规则如下：

- 发送间隔属于其后的请求，而不是其前的请求。
- 第一条请求始终立即发送。
- 新增发送间隔默认 50 秒；非空值最小为 40 秒。
- 一条发送间隔会拆成 2 次请求；两条发送间隔会拆成 3 次请求。
- 真实发送按顺序串行执行。某条失败不会阻断后续请求。
- 无消息流时，仍会生成 1 条 JSON，`input` 取用例的 `message.input`；没有内容时为 `['']`。

## 4. 身份、会话与唯一性规则

### 同一次多轮发送

同一次 `buildSnapshots()` 调用会创建一个会话对象，因此所有快照都共享以下字段：

```text
weworkCorpId
weworkAccount
friendExternalId
friendRemoteId
weworkAccountAlias
friendNick
```

这表示同一个老师与同一个学员的连续对话。

但每条 JSON 的 `requestId` 都不同。

### 不同测试用例或不同发送操作

每次发送一个测试用例都会重新创建会话对象，因此会重新生成老师、学员及相关标识。批量发送按当前选中顺序逐个发送，每个用例各自拥有独立会话。

`teacherId` 也会在内部会话对象中随机生成，但当前版本未写入业务 JSON，不应作为发送字段核对。

### `conversation_id`

`conversation_id` 不在 MQ 发送 JSON 内。它仅用于测试记录列表和记录详情展示，计算方式为：

```text
{weworkAccount}_{friendExternalId}
```

取第一条快照的对应字段生成。

## 5. 会话属性覆盖规则

用例可配置 `friendNick`、`weworkAccountAlias`、`latestMsgTime`、`addTime`，以及保存的自定义属性。

优先级为：

1. 发送弹窗中本次选择的 `agentId` 最高优先级。
2. `perMessage` 模式下，当前请求第一条消息的属性覆盖字段。
3. `custom` 或 `unified` 模式下，`session.attributes` 覆盖字段。
4. 用例 `message` 中保存的字段。
5. 系统随机值或全局默认值。

补充说明：

- `tagList` 属性会被解析为数组。
- `addTime` 与 `latestMsgTime` 会格式化为 `YYYY-MM-DD HH:mm:ss`。
- 当前编辑页允许选择的会话属性由 `config.json` 的 `sessionAttributeFields` 控制；服务端会忽略其中 `agentId` 和 `tagList` 的配置项，但仍兼容历史或导入数据里的同名属性。
- JSON 模式中的预览由前端独立构建；实际点击发送时仍以本文所述服务端规则为准。

## 6. 历史消息规则

`inputList` 是历史上下文，不是本次实际发送内容。

- 用例编辑页中的历史消息按 `{发送方标识}:{消息内容}` 保存。
- 标识以 `168885` 开头时，界面显示为老师消息；其他标识显示为学员消息。
- 首次请求直接带上保存的 `inputList`。
- 每发送完一组学员消息，该组消息会用本次 `friendRemoteId` 前缀追加到内存历史中，供下一条 JSON 使用。

## 7. 追加消息规则

在测试记录详情中使用“追加消息”时：

- 复制该记录最后一条快照的完整 payload。
- 保持 `weworkAccount`、`friendExternalId`、`weworkCorpId`、`weworkAccountAlias`、`friendNick`、`friendRemoteId` 等会话字段不变。
- 将最后一条 payload 的 `input` 追加进历史后，把用户新输入文本设置为新的 `input = [新消息]`。
- `latestMsgTime` 在最后一条 payload 的时间上默认增加 20 秒。
- 重新生成新的 `requestId`。
- 追加消息本身不等待发送间隔，快照中的 `delaySeconds` 为 0。

## 8. MQ 网关请求封装

发送到网关的 HTTP 请求并非直接把上述 JSON 作为根对象，而是：

```json
{
  "config": {
    "appId": "MQ 配置中的 App ID",
    "topic": "MQ 配置中的 Topic",
    "producerGroup": "MQ 配置中的 Producer Group",
    "secretKey": "MQ 配置中的 Secret Key",
    "nameServer": "MQ 配置中的 NameServer",
    "messageType": "MQ 配置中的 Message Type"
  },
  "messageBody": "上文业务 JSON 序列化后的字符串",
  "tag": "",
  "keys": "requestId 的值"
}
```

`Secret Key` 只用于发送给 MQ 网关，不会写入测试记录、测试用例导出文件或前端公开配置接口。

## 9. 测试记录中的额外字段

以下字段用于本地记录，不属于业务发送 JSON：

- `snapshots[].delaySeconds`：该快照发送前实际等待秒数。
- `snapshots[].mqResult`：真实 MQ 回执，含 `success`、`msgId`、`offsetMsgId`、`sendStatus`、`error`、`sentAt`。
- `conversationId`：由第一条快照的 `weworkAccount` 与 `friendExternalId` 拼接。
- `mqMessageCount`：本次请求 JSON 总数。
- `userMessageCount`：所有快照 `input` 数量之和。
- `triggerMessages`：所有快照 `input` 扁平化后的消息数组。

## 10. 核对建议

1. 核对同一次多轮发送时，所有快照的会话标识是否一致。
2. 核对每个快照的 `requestId` 是否不同。
3. 核对后续 `latestMsgTime` 是否等于上一条时间加该快照的 `delaySeconds`。
4. 核对后续 `inputList` 是否包含此前已发送的学员消息。
5. 核对网关请求的 `keys` 是否等于对应业务 JSON 的 `requestId`。
