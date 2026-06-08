# TDD Dashboard 工程架构分析

> 生成时间：2026-06-08
> 分析范围：oh-my-openagent / oh-my-openagent-wt

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TDD Dashboard (前端)                          │
│  tdd-dashboard.html (独立 HTML 文件, ~2000 行)                       │
│  - SSE 事件流监听 (/event 端点)                                      │
│  - 阶段推断引擎 (tool name + input → TDD stage)                     │
│  - 8步进度条可视化                                                   │
│  - 诊断功能 (API 回溯验证)                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ SSE / REST API
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    opencode serve (原版, 无侵入)                      │
│  - /session        → session CRUD                                    │
│  - /event          → SSE 事件流                                       │
│  - /session/{id}/message → 消息查询                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              oh-my-openagent-wt (Plugin/Feature 层)                  │
│  feature/test-runner-tool/                                          │
│  ├── src/tools/delegate-task/     ← 子代理调度核心                   │
│  │   ├── sync-session-creator.ts  ← 【唯一侵入点】模型继承逻辑       │
│  │   ├── sync-prompt-sender.ts    ← prompt 发送                     │
│  │   ├── sync-session-poller.ts   ← 轮询子代理状态                  │
│  │   └── ... (~80 个文件)                                          │
│  ├── src/tools/skill/            ← Skill 调用 (prd-to-acceptance 等)│
│  ├── src/hooks/                  ← Hook 系统                        │
│  └── dist/                       ← 编译产物                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. 核心模块说明

### 2.1 TDD Dashboard (tdd-dashboard.html)

纯前端单文件应用，零后端依赖。

| 模块 | 职责 |
|------|------|
| SSE 事件监听 | 通过 EventSource 订阅 `/event` 端点，实时接收 opencode 事件流 |
| 事件过滤 | 从 `properties.sessionID`、`properties.info.sessionID`、`properties.part.sessionID` 多路径提取 sessionID，过滤非当前 session 事件 |
| 子代理检测 | 通过 `checkIsChildSession()` 查询 `/session/{id}` API，检查 `parentID/parent_id` 字段 |
| 阶段推断引擎 | `inferStageFromTool()` + `inferStageFromToolResult()` + `inferStageFromText()` 三路推断 |
| 进度条渲染 | 8步 TDD 流程：PRD → AC → Test → Impl → Testing → Fixing → Verified → Completed |
| 诊断功能 | 回溯查询消息 API，验证阶段信号覆盖率 |

### 2.2 opencode serve (原版服务)

未做任何源码修改，作为黑盒 API 服务运行。

| API 端点 | 用途 |
|----------|------|
| `POST /session` | 创建 session（含 directory query param） |
| `GET /session/{id}` | 获取 session 详情（含 parentID 字段） |
| `GET /session` | 列出所有 session |
| `GET /session/{id}/message` | 获取 session 消息（含 tool parts） |
| `POST /session/{id}/prompt_async` | 异步发送 prompt |
| `GET /event` | SSE 事件流（message.part.updated 等） |

### 2.3 oh-my-openagent-wt (Plugin 层)

通过 opencode 的 plugin 机制加载，核心为 `feature/test-runner-tool/`。

| 目录 | 职责 |
|------|------|
| `src/tools/delegate-task/` | 子代理调度（sync/async 模式） |
| `src/tools/skill/` | Skill 调用（prd-to-acceptance, test-generation, tdd-verification 等） |
| `src/tools/look-at/` | 多模态查看工具 |
| `src/tools/hashline-edit/` | 代码编辑工具 |
| `src/tools/grep/` | 代码搜索工具 |
| `src/tools/consensus/` | 共识工具 |
| `src/hooks/` | Hook 系统（事件拦截、预处理） |

## 3. 对 opencode 原版的侵入分析

| 维度 | 侵入程度 | 说明 |
|------|---------|------|
| **源码修改** | **零** | 不修改 opencode 任何一行源码 |
| **编译时依赖** | **低** | 通过 plugin 机制加载，不改变 opencode 构建流程 |
| **运行时行为** | **极低** | 仅在 `sync-session-creator.ts` 中新增 `resolveSessionModel()` 函数（~30行） |
| **API 协议** | **零** | 完全使用 opencode 原生 REST API 和 SSE 协议 |
| **数据库** | **零** | 不触碰 opencode SQLite 数据库结构 |

**综合侵入性评估：≈ 0.5%**

### 3.1 唯一的功能增强点

文件：`oh-my-openagent-wt/feature/test-runner-tool/src/tools/delegate-task/sync-session-creator.ts`

```typescript
// 新增逻辑：子代理创建时继承父 session 的模型配置
function resolveSessionModel(categoryModel, parentSession) {
  if (categoryModel) return categoryModel;           // 显式指定优先
  const parentModel = parentSession?.data?.model;      // 从父 session 继承
  if (parentModel?.id && parentModel?.providerID) {
    return { id: parentModel.id, providerID: parentModel.providerID };
  }
  return undefined;  // 兜底：让 opencode 用默认值
}
```

此函数解决 `ProviderModelNotFoundError`：子代理创建时未传递模型配置，opencode 使用错误默认格式。

### 3.2 零侵入方案

如需完全零侵入，可将 `resolveSessionModel` 逻辑移至 Dashboard 层，在创建 session 时通过 API 显式传入模型参数。

## 4. SSE 事件流与阶段推断

### 4.1 事件类型映射

| SSE 事件类型 | Dashboard 处理 | 阶段推断 |
|-------------|---------------|---------|
| `server.connected` | 设置 Connected 状态 | - |
| `server.heartbeat` | 心跳保活 | - |
| `session.created` | 检测子代理 | - |
| `message.part.updated` | 核心事件 | tool part → 阶段推断 |
| `message.updated` | 消息完成 | - |

### 4.2 阶段推断规则

| TDD 阶段 | 触发信号 | 推断来源 |
|----------|---------|---------|
| PRD_RECEIVED | 用户提交 PRD | 手动设置 |
| AC_GENERATED | `skill(prd-to-acceptance)` | tool name + input |
| TEST_GENERATED | `skill(test-generation)` | tool name + input |
| IMPLEMENTING | `write()`, `edit()`, `bash()` | tool name |
| TESTING | `test_runner()`, `bash(pytest)` | tool name + input |
| FIXING | `skill(failure-analysis)`, 测试失败 | tool name + text |
| VERIFIED | `skill(tdd-verification)`, `delegate-task` 完成 | tool name + result |
| COMPLETED | verification skill 完成, session idle | tool result + text |

### 4.3 ToolPart 结构

SSE 事件中 `message.part.updated` 的 tool part 结构：

```json
{
  "type": "tool",
  "tool": "skill",
  "state": {
    "status": "running" | "completed" | "error" | "pending",
    "input": { "name": "prd-to-acceptance", "user_message": "..." },
    "output": "..."
  }
}
```

## 5. 已修复的关键问题

| 问题 | 根因 | 修复方案 |
|------|------|---------|
| 左右侧不同步 | 事件过滤逻辑仅检查顶层 sessionID | 从 `props.part.sessionID` 多路径提取 |
| 子代理模型继承失败 | 创建 session 时未传递模型配置 | `resolveSessionModel()` 从父 session 继承 |
| tool part pending 状态丢失 | 未处理 pending 状态 | 增加 pending/running 双状态处理 |
| 子代理 session 检测失败 | 字段名 `parentID` vs `parent_id` | 兼容多种字段名 |
| SSE 订阅时序问题 | 订阅在 prompt 之后 | 先订阅再发送 prompt |
| Messages API 路径错误 | `/messages` vs `/message` | 探测正确路径 |

## 6. 验证结果

### 6.1 阶段信号覆盖率（5/5 通过）

| 阶段 | API 捕获 | SSE 捕获 |
|------|---------|---------|
| AC_GENERATED | YES | YES |
| TEST_GENERATED | YES | YES |
| IMPLEMENTING | YES | YES |
| TESTING | YES | YES |
| VERIFIED | YES | YES |

### 6.2 诊断示例输出

```
Stage coverage: 5/5 [AC_GENERATED, TEST_GENERATED, IMPLEMENTING, TESTING, VERIFIED]
Missing stages: none
Child sessions: 1
Total tool calls found: 22
```

## 7. 待优化项

1. 实时 SSE 事件流中左侧进度条同步验证
2. 多子代理场景下事件过滤稳定性
3. 网络延迟下异步子代理检测可靠性
4. SSE 事件中 ToolPart 字段与消息 API 一致性确认
