# CodeGraph 依赖分析报告

> 生成时间：2026-06-08
> 分析工具：codegraph v0.9.8 + 手动依赖追踪
> 分析范围：oh-my-openagent / oh-my-openagent-wt

---

## 1. CodeGraph 索引信息

- **工具版本**：codegraph v0.9.8
- **索引命令**：`codegraph init .`
- **索引状态**：sandbox 环境中无法完成索引（tree-sitter native binding 限制）
- **替代方案**：手动依赖追踪 + SearchCodebase 语义分析

## 2. 核心模块依赖图

```
tdd-dashboard.html (前端)
  ├── opencode REST API (/session, /session/{id}/message, /event)
  │   └── opencode serve (原版服务, 无侵入)
  │       └── oh-my-openagent-wt plugin (通过 plugin 机制加载)
  │           ├── src/tools/delegate-task/
  │           │   ├── sync-session-creator.ts ← 创建子代理 session
  │           │   ├── sync-prompt-sender.ts   ← 发送 prompt
  │           │   ├── sync-session-poller.ts  ← 轮询子代理状态
  │           │   ├── sync-result-fetcher.ts  ← 获取结果
  │           │   ├── sync-task.ts            ← 同步任务编排
  │           │   ├── sync-continuation.ts    ← 续接逻辑
  │           │   ├── executor.ts             ← 执行器
  │           │   ├── prompt-builder.ts       ← prompt 构建
  │           │   ├── skill-resolver.ts       ← skill 解析
  │           │   ├── subagent-resolver.ts    ← 子代理解析
  │           │   ├── model-selection.ts      ← 模型选择
  │           │   └── categories.ts           ← 分类定义
  │           ├── src/tools/skill/
  │           │   ├── tools.ts                ← skill 工具实现
  │           │   ├── skill-matcher.ts        ← skill 匹配
  │           │   ├── native-skills.ts        ← 原生 skill 定义
  │           │   └── scope-priority.ts       ← 作用域优先级
  │           └── src/hooks/
  │               ├── create-hooks.ts         ← hook 注册
  │               └── ... (事件拦截/预处理)
  └── SSE EventSource (/event)
      └── message.part.updated → 阶段推断引擎
```

## 3. 关键调用链

### 3.1 TDD 流程调用链

```
用户提交 PRD
  → Dashboard: POST /session (创建 session)
  → Dashboard: POST /session/{id}/prompt_async (发送 PRD)
  → opencode: SSE event → message.part.updated
    → skill(prd-to-acceptance) → AC_GENERATED
    → skill(test-generation) → TEST_GENERATED
    → write/edit/bash → IMPLEMENTING
    → test_runner/bash(pytest) → TESTING
    → skill(tdd-verification) → VERIFIED
    → verification 完成 → COMPLETED
```

### 3.2 子代理创建调用链

```
delegate-task 工具调用
  → sync-task.ts: createSyncSession()
    → sync-session-creator.ts: resolveSessionModel() ← 模型继承
    → sync-session-creator.ts: client.session.create({ parentID, model })
  → sync-prompt-sender.ts: client.session.chat({ sessionID, message })
  → sync-session-poller.ts: 轮询 session 状态
  → sync-result-fetcher.ts: 获取最终结果
```

### 3.3 SSE 事件处理链

```
EventSource(/event)
  → handleEvent(payload)
    → sessionID 提取: props.sessionID / props.info.sessionID / props.part.sessionID
    → 事件过滤: 仅处理当前 session + 子代理 session
    → processEvent(payload)
      → handleMessagePartUpdated(part)
        → tool part: inferStageFromTool(name, input)
        → tool result: inferStageFromToolResult(name, output)
      → handleMessageUpdated(msg)
        → text part: inferStageFromText(content)
```

## 4. 文件耦合分析

### 4.1 高耦合文件（被多个模块依赖）

| 文件 | 被依赖次数 | 依赖方 |
|------|-----------|--------|
| `sync-session-creator.ts` | 8+ | sync-task, sync-continuation, metadata tests |
| `sync-task.ts` | 10+ | executor, background-task, tests |
| `tools.ts` (delegate-task) | 5+ | index, executor, tests |
| `skill/tools.ts` | 3+ | skill-mcp, index |

### 4.2 关键接口边界

| 边界 | 接口 | 方向 |
|------|------|------|
| Dashboard ↔ opencode | REST API + SSE | 双向 |
| Plugin ↔ opencode | OpencodeClient SDK | 单向（调用） |
| delegate-task ↔ opencode | session CRUD + chat API | 单向（调用） |
| Dashboard ↔ Plugin | 无直接依赖 | 通过 opencode API 间接交互 |

## 5. 影响半径分析

### 5.1 修改 sync-session-creator.ts 的影响

```
sync-session-creator.ts
  ├── sync-task-deps.ts (import)
  │   ├── sync-task.ts (依赖)
  │   ├── sync-continuation.ts (依赖)
  │   └── background-continuation.ts (依赖)
  ├── sync-session-creator.test.ts (测试)
  ├── metadata-model-unification.test.ts (测试)
  └── metadata-task-id-consistency.test.ts (测试)
```

**影响范围**：6 个文件，均为 delegate-task 内部模块。不影响 opencode 核心。

### 5.2 修改 tdd-dashboard.html 的影响

```
tdd-dashboard.html (独立文件，无代码依赖)
  └── 仅通过 HTTP API 与 opencode 交互
```

**影响范围**：0 个代码文件。完全独立。

## 6. CodeGraph 访问方式

### 6.1 本地索引（需在非 sandbox 环境运行）

```bash
cd /Users/lancer.zhang/ProjectNIO/oh-my-openagent
codegraph init .
codegraph status .
codegraph query "delegate-task" --json
codegraph impact "createSyncSession"
codegraph context "TDD Dashboard SSE event handling"
```

### 6.2 MCP 服务器模式

```bash
codegraph serve
# 通过 MCP 协议连接 AI 助手（Claude Code, Cursor 等）
```

### 6.3 分析结果存储路径

- **索引数据库**：`.codegraph/*.db`
- **本文档**：`docs/architecture/codegraph-analysis.md`
- **架构文档**：`docs/architecture/tdd-dashboard-architecture.md`

---

> 注：codegraph 索引需在本地终端（非 sandbox）环境中运行：
> ```bash
> cd /Users/lancer.zhang/ProjectNIO/oh-my-openagent
> codegraph init . --verbose
> codegraph analyze . --all --json > codegraph-report.json
> ```
