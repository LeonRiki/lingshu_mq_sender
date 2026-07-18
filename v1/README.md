# 灵枢 MQ 发送器 V1

本版本使用本地 Node 服务 + 静态网页实现，用于构建、发送和留存 AI 工作流消息测试数据。运行时不需要安装 npm 依赖。

## 启动

Windows：

```bat
win-启动服务.bat
```

macOS：

```bash
./mac-启动服务.command
```

启动后会自动打开浏览器访问本地服务。默认端口为 `32880`，如果端口被占用会自动顺延。

如果 macOS 双击启动文件提示权限限制，先双击 `mac-修复权限.command`，再重新双击 `mac-启动服务.command`。

## 数据目录

```text
config.json   全局配置
cases/        测试用例 JSON
records/      测试记录快照，按日期分目录
cache/        MQ 配置、运行缓存与在线更新备份
```

## 已实现功能

- 测试用例管理
- 单轮 / 多轮消息编辑，以及 JSON 模式编辑
- 会话属性、TagList、业务场景和 Agent ID 管理
- 协议消息 JSON 构建与预览
- CSV / JSON 测试用例导入和 JSON 导出
- MQ 配置管理：网关地址、App ID、Topic、Producer Group、NameServer、Secret Key 和 Message Type
- MQ 网关就绪检查、单用例发送和批量顺序发送
- 发送记录快照保存、记录详情查看和同会话追加消息
- 测试记录按消息、企微账号 ID、好友昵称、Conversation ID、场景和 Agent ID 检索
- 标签与业务场景的创建、归档、替换和批量删除
- 公开 GitHub Release 在线更新：检查版本、校验下载、白名单替换、自动备份、回滚、服务重启和页面刷新

## 在线更新发布

在线更新仅使用公开 GitHub Release，不保存 GitHub Token。发布新版本时：

1. 更新 `version.json` 中的版本号。
2. 执行 `npm run build`，再执行 `npm run release:manifest` 生成 `update-manifest.json`。
3. 提交源码和清单，创建与版本对应的 Git tag。
4. 创建 GitHub Release，并将 `update-manifest.json` 作为名为 `v1-update-manifest.json` 的附件上传。

客户端在“在线更新”中填写公开仓库的 `owner/repository` 后，即可检查并安装新版本。更新只会替换源码白名单内的文件，绝不会覆盖 `config.json`、`cache/mq-configs.json`、`cases/` 或 `records/`。

## 依赖

需要用户电脑已安装 Node.js 18 或更高版本。
