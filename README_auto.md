# TDD Loop - 自动化测试驱动开发系统

基于 oh-my-openagent 的 TDD 自动化闭环系统，实现从 PRD 到验证通过的全流程自动化。

## 系统架构

```
PRD ──→ /prd-to-acceptance ──→ AC (验收标准)
                                    │
                                    ▼
                            /test-generation ──→ 测试用例
                                                    │
                                                    ▼
                                            代码实现 (Agent)
                                                    │
                                                    ▼
                                            test_runner ──→ 测试结果
                                                    │
                                          ┌─────────┴─────────┐
                                          │                   │
                                     PASS ▼              FAIL ▼
                              /tdd-verification      /failure-analysis
                              (四层闭环验证)           (根因分析)
                                                            │
                                                    ┌───────┴───────┐
                                                    │               │
                                              代码修复      /requirement-diagnosis
                                                            (需求诊断)
```

## 安装

### 前置条件

- Node.js >= 18
- Python >= 3.10 (用于运行测试)
- Git

### 1. 克隆仓库

```bash
git clone https://github.com/code-yeongyu/oh-my-openagent.git
cd oh-my-openagent
git checkout feature/test-runner-tool
```

### 2. 构建项目

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 验证构建产物
ls dist/index.js
```

### 3. 配置 OpenCode

编辑 `~/.config/opencode/opencode.json`：

```json
{
  "plugin": [
    "file:///path/to/oh-my-openagent/dist/index.js"
  ],
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "zhipuai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "智谱AI Coding",
      "options": {
        "baseURL": "https://open.bigmodel.cn/api/coding/paas/v4",
        "apiKey": "<YOUR_API_KEY>"
      },
      "auth": {
        "type": "api-key",
        "headerName": "Authorization",
        "headerPrefix": "Bearer "
      },
      "models": {
        "glm-5.1": {
          "name": "zai/glm-5.1",
          "type": "chat"
        }
      }
    }
  },
  "model": "zhipuai/glm-5.1"
}
```

> **注意**: 将 `file:///path/to/oh-my-openagent/dist/index.js` 替换为实际的构建产物路径。

### 4. 验证安装

```bash
opencode debug info
opencode debug skill
```

确认输出中包含以下 TDD 技能：
- `prd-to-acceptance`
- `test-generation`
- `failure-analysis`
- `requirement-diagnosis`
- `tdd-verification`

## 配置说明

### 模型配置

支持任何 OpenAI 兼容的 LLM 提供商。配置格式为 `<providerID>/<modelID>`，例如：

| 提供商 | providerID | modelID | 说明 |
|--------|-----------|---------|------|
| 智谱AI | zhipuai | glm-5.1 | 推荐，已验证 |
| OpenAI | openai | gpt-4o | 需配置 baseURL |
| DeepSeek | deepseek | deepseek-chat | 需配置 baseURL |

### TDD 开关

在 Sisyphus Agent 配置中，`tdd` 布尔值控制是否启用 TDD 导向规划（默认 `true`）。

## 使用方式

### 方式一：命令行

```bash
# 在项目目录下启动
cd /your/project
opencode run "Read PRD.md and implement following TDD approach:
1) Use /prd-to-acceptance to generate acceptance criteria
2) Use /test-generation to generate tests
3) Implement the code
4) Run test_runner to execute tests
5) Fix failures until all tests pass
6) Run /tdd-verification to verify"
```

### 方式二：TDD Dashboard

Dashboard 提供可视化界面，实时展示 TDD 流程各阶段进度。

#### 启动服务

```bash
# 1. 启动 OpenCode HTTP 服务
cd /your/project
opencode serve --port 3001 --cors http://localhost:8080

# 2. 启动静态文件服务（用于 Dashboard）
cd /path/to/dashboard
python3 -m http.server 8080
```

#### 使用 Dashboard

1. 浏览器打开 `http://localhost:8080/tdd-dashboard.html`
2. 点击 Settings 配置：
   - **Server URL**: `http://127.0.0.1:3001`
   - **Project Directory**: 项目路径
   - **Model Provider ID**: `zhipuai`
   - **Model ID**: `glm-5.1`
3. 在文本框中粘贴 PRD 内容
4. 点击 **Start TDD**
5. 观察事件流中的各阶段进度

### 方式三：API 调用

```bash
# 创建 session
SESSION_ID=$(curl -s -X POST http://127.0.0.1:3001/session \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 订阅 SSE 事件流
curl -s -N http://127.0.0.1:3001/event

# 提交 PRD prompt
curl -X POST "http://127.0.0.1:3001/session/$SESSION_ID/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [{"type": "text", "text": "Use /prd-to-acceptance then /test-generation then implement..."}],
    "model": {"providerID": "zhipuai", "modelID": "glm-5.1"}
  }'
```

## TDD 技能说明

### /prd-to-acceptance

将 PRD/需求文档转换为可验证的验收标准（AC），支持 PRD↔AC 双向追溯。

输出格式：
```yaml
- id: AC-NNN
  description: "<可验证的断言>"
  priority: P0|P1|P2
  category: happy_path|edge_case|error_case
  source:
    document: "<来源文档>"
    section: "<章节>"
  test_file: "<建议的测试文件路径>"
  source_module: "<建议的源码模块>"
```

特性：
- 反谄媚自检机制（anti-sycophancy）
- PRD 覆盖率自检
- Oracle 交叉验证门

### /test-generation

从验收标准生成高质量回归测试，支持 AC↔Test 双向追溯。

规则：
- 一个测试验证一个行为
- 命名规范：`test_<feature>_<scenario>_<expected_result>`
- 测试独立，可任意顺序执行
- 每个 AC 至少一个 happy path + 一个 edge case

### /failure-analysis

基于证据的测试失败根因分析，强制"观察优于推断"原则。

触发条件：
- test_runner 输出包含失败用例
- 修复后测试仍然失败

输出包含 `should_escalate` 标志，决定是否升级到需求诊断。

### /requirement-diagnosis

当实现循环无法收敛时，诊断需求层面的问题（矛盾、不可行、歧义、不完整）。

触发条件：
- failure-analysis 返回 `should_escalate: true`
- 同一 AC 失败 3+ 次
- Momus 审查标记需求问题

### /tdd-verification

执行四层闭环验证，生成最终验收报告：

| 层级 | 验证内容 | 方法 |
|------|---------|------|
| 第1层 | PRD 覆盖率 | 每个 PRD 需求是否有对应 AC |
| 第2层 | AC 测试覆盖率 | 每个 AC 是否有对应测试 |
| 第3层 | AC 实现覆盖率 | 每个 AC 是否有代码实现 |
| 第4层 | 测试通过率 | 所有测试是否通过 |

Oracle 交叉验证门：独立验证门槛，假设报告错误并尝试证伪，输出 VERIFIED 或 NOT_VERIFIED。

## test-runner 工具

内置测试执行工具，支持自动检测测试框架并执行。

支持的框架：
- pytest (Python)
- jest (JavaScript/TypeScript)
- vitest (JavaScript/TypeScript)
- go test (Go)
- cargo test (Rust)

AC 覆盖率验证：解析测试输出，匹配 AC 编号，计算覆盖率百分比。

## test-result-capture 钩子

自动捕获测试结果并分析 AC 覆盖率的钩子，在测试执行后自动触发。

功能：
- 解析 test_runner 输出
- 计算 AC 覆盖率
- 检测需求信号（交替回归、重复新场景）
- 触发 failure-analysis 或 requirement-diagnosis

## SSE 事件流

OpenCode serve 的 SSE 端点为 `/event`，推送以下事件类型：

| 事件类型 | 说明 |
|---------|------|
| `server.connected` | 连接成功 |
| `server.heartbeat` | 心跳 |
| `session.next.agent.switched` | Agent 切换 |
| `session.next.model.switched` | 模型切换 |
| `session.status` | Session 状态 (busy/idle) |
| `session.updated` | Session 信息更新 |
| `session.diff` | 代码变更 |
| `message.updated` | 消息更新 |
| `message.part.updated` | 消息部分更新 (text/tool/step-start/step-finish) |
| `message.part.delta` | 流式文本增量 |

## 端到端验证示例

以下 PRD 已通过完整 TDD 流程验证：

```markdown
# Calculator PRD

## 功能需求
实现一个简单的计算器模块 calculator.py，包含以下函数：
1. add(a, b) - 返回两个数的和
2. subtract(a, b) - 返回两个数的差
3. multiply(a, b) - 返回两个数的积
4. divide(a, b) - 返回两个数的商，除数为0时抛出 ValueError
```

验证结果：
- 生成 12 个验收标准 (AC-001 ~ AC-012)
- 生成 18 个测试用例，每个标注 AC 编号
- 实现代码通过全部 18 个测试
- 四层闭环验证通过

## 故障排除

### 技能未加载

```bash
opencode debug skill
```

如果未显示 TDD 技能，检查：
1. `opencode.json` 中 plugin 路径是否正确
2. 构建产物 `dist/index.js` 是否存在
3. 运行 `pnpm build` 重新构建

### 模型未找到

确保 `prompt_async` 请求中指定了正确的 model 参数：
```json
{"model": {"providerID": "zhipuai", "modelID": "glm-5.1"}}
```

格式为 `<providerID>/<modelID>`，不要使用冒号分隔。

### SSE 连接失败

1. 确认 opencode serve 正在运行：`curl http://127.0.0.1:3001/`
2. SSE 端点为 `/event`（不是 `/events`）
3. 启动 serve 时添加 CORS：`opencode serve --cors http://localhost:8080`

### Dashboard 显示 Disconnected

1. 检查 Server URL 是否正确
2. 确认 opencode serve 进程存活
3. 浏览器控制台查看网络请求错误

## 文件结构

```
oh-my-openagent/
├── src/
│   ├── tools/
│   │   └── test-runner/          # test-runner 工具
│   │       ├── tool.ts           # 工具实现
│   │       ├── framework-detector.ts  # 框架自动检测
│   │       ├── ac-coverage.ts    # AC 覆盖率分析
│   │       └── types.ts
│   ├── hooks/
│   │   └── test-result-capture.ts  # 测试结果捕获钩子
│   ├── tools/delegate-task/
│   │   └── prompt-builder.ts     # TDD 提示构建
│   └── features/builtin-skills/
│       └── skills.ts             # 技能注册
├── packages/shared-skills/skills/
│   ├── prd-to-acceptance/        # PRD → AC 技能
│   ├── test-generation/          # AC → 测试技能
│   ├── failure-analysis/         # 失败分析技能
│   ├── requirement-diagnosis/    # 需求诊断技能
│   └── tdd-verification/         # TDD 验证技能
└── tdd-dashboard.html            # TDD Dashboard 页面
```
