# 泰迪的日常 | Stateful Pet Companion Agent

一个可运行的中文 AI Agent 演示：泰迪能理解日常聊天、只按用户明确授权调用有限工具、记住被允许保存的简单偏好，并持续维护虚拟宠物状态。浏览器负责交互，Node.js 标准库实现服务端和 Agent 循环；无需第三方运行依赖或数据库。

## 5 分钟启动

前置要求：Node.js 22.14 或更新版本。

```powershell
npm start
```

访问终端显示的 `http://127.0.0.1:8000`。默认启用本地规则模式，能完成完整演示，不需要模型密钥。

接入任意兼容 Chat Completions 的模型服务：复制 `.env.example` 为 `.env`，填写 HTTPS 服务地址、模型名称和 API Key，然后运行 `npm start`。LLM 配置缺失或不完整会使服务启动失败，不会悄悄改用规则。模型超时、429、非法输出或不合规工具调用会显示经过脱敏的回退事件。API Key 只在后端环境中，绝不发给浏览器。

```powershell
Copy-Item .env.example .env
npm start
```

清理会话文件：停止服务后删除 `.data/`。同一来源每分钟最多请求 120 次。`HOST` 只允许回环地址；这是面向本机作品演示的单进程应用，不是生产部署配置。

## 面试演示脚本

1. 说「我叫小林」，展示显式授权的长期记忆；再问「我叫什么」，展示跨轮次召回。
2. 说「陪我玩球」，观察能量降低、表情变化和状态面板刷新；说「你现在状态怎么样」，只读状态、不误执行照护动作。
3. 展示「本次执行记录」，依次查看授权判断、上下文读取、受约束工具执行、完成回复。调试信息仅展示可观测事件，不展示或声称展示模型的私有思维链。
4. 试着输入「不要喂食」或「给你吃巧克力」，确认否定授权和动物安全边界生效。
5. 打开第二个页面演示同一浏览器持久会话；刷新恢复状态；在一页完成互动后，另一页会自动同步。
6. 点击「忘记这些」清除偏好与对话。重置操作会清除状态、等级和互动足迹。

建议用自己配置的模型做面试演示；不带密钥的默认模式明确显示「本地规则演示」。

## Agent 架构

```text
Browser UI
  -> POST /api/chat {message, expectedVersion, requestId}
  -> same-origin validation / rate limit / session lookup
  -> deterministic safety + authorization policy
  -> bounded conversation context + explicit preference memory
  -> optional model provider -> strict read/care/remember tools
  -> server tool allowlist + same-turn user authorization + care rules
  -> staged state, safe fallback on provider/tool error, idempotent commit
  -> sanitized trace + persisted session + rendered emotion
```

工具授权、参数、预算、虚拟宠物照护约束和事务状态都由服务端校验；模型不能直接改变状态。每轮最多一次照护、最多四次工具、最多三次模型调用、8 秒总模型预算、64 KiB 提供方响应上限。状态变更先暂存，模型后续失败时整体回滚再本地回退，避免重复动作。请求编号消除重放副作用，`expectedVersion` 检测多页面并发，进程内每会话队列串行化更新。LLM 兼容适配器要求严格工具模式、禁止并行工具，密钥放在 Authorization header，限制 HTTPS 和重定向。浏览器用 HttpOnly、SameSite 会话 Cookie；不持久化原始调用日志或模型请求体。

会话数据保存在工作区忽略的 `.data/`，原子替换 JSON 快照，不存入全局 Cookie 或浏览器 localStorage。每次刷新时以真实时钟结算从上次访问经过的 5 分钟周期，模拟心情、饱腹、活力随时间变化；离线衰减最多按 8 小时计算，且饱腹不可能无限饥饿。日次数按 Asia/Shanghai 自然日归零。`node:test` 使用确定性时钟，隔离行为评测和真实时间衰减。

> `.data` 是开发态、单进程文件存储；多进程水平扩容、持久事务、跨实例请求去重均需迁移到 SQLite/Postgres + 原子行版本。不要在现有持久数据未备份时切换存储方案。

## 接口与开发

- `GET /api/health`：健康状态与运行模式。
- `GET /api/session`：创建或读取浏览器会话、当前宠物状态与记忆。
- `POST /api/chat`：Agent 文本对话、工具执行和追踪记录。
- `POST /api/actions`：界面快捷照护。
- `POST /api/reset`、`/api/forget`、`/api/log/clear`：按明确范围清除数据；每个变更请求都需要 `expectedVersion`、`requestId`。
- 修改 `assets/manifest.json` 会更新已登记的姿势、表情、道具和特效。外观设置单独保存在浏览器本地，不影响宠物状态。

```powershell
npm test
npm run eval
npm run check:assets
npm run dev
```

测试无需联网或真实 API 密钥；本仓库无 `npm install` 运行依赖。真实模型联调使用 `.env.example` 配置兼容提供方，不要将真实密钥提交到 Git。

CI 在每次 push 和 pull request 时运行安装锁文件校验、Node 测试、意图回归评测和素材清单检查。工具描述采用 OpenAI 官方 function calling strict schema 和工具调用往返协议：[Function calling | OpenAI API](https://developers.openai.com/api/docs/guides/function-calling)。

## 面试介绍（60 秒）

“我做了一个可持续互动的虚拟宠物 Agent。我重点解决的是模型不能直接成为可信的状态修改器：先用服务端策略提取本轮用户授权，再把状态和授权注入模型上下文，工具只能读状态、执行白名单照护或保存明确偏好，每次调用都会验证参数和授权。状态修改会在事务草稿里暂存，模型输出失败、越权或超时时回滚再走规则回退，通过请求幂等键避免重复执行。对话记忆和虚拟宠物状态持久保存，并提供心情随时间衰减、跨标签同步和忘记数据操作。当前基线是 Node 标准库、零运行依赖和单进程 JSON 存储，附有确定性行为评测与工具审计测试；数据库、多实例部署和真实效果指标是下一步。”

不要声称模型在本地规则模式运行、虚构线上指标，也不要把演示级文件存储描述为生产数据库。
