# OpenAgent 远程部署运维手册

## 部署环境

| 项目 | 值 |
|------|-----|
| 服务器 | d-qcsh5-nacos-register-76ef6952-02 (10.132.108.68) |
| 容器名 | opencode-serve |
| 端口 | 3001 |
| LLM | 智谱AI glm-5.1 (`https://open.bigmodel.cn/api/coding/paas/v4`) |
| 代理 | `proxy.nioint.com:8080` |
| Dashboard | `http://10.132.108.68:8080/tdd-dashboard.html` |

## 已解决的问题

### 1. LLM API 请求 hang 住

**现象**：Dashboard 提交 PRD 后无响应，agent session idle。

**原因**：容器内未配置 `http_proxy`/`https_proxy`，企业网络需通过代理才能访问外网 LLM API。

**修复**：启动容器时传入代理环境变量：
```bash
-e http_proxy=http://proxy.nioint.com:8080
-e https_proxy=http://proxy.nioint.com:8080
-e no_proxy=localhost,127.0.0.1
```

### 2. 容器内无法访问目标项目目录

**现象**：agent 报 `/home/lancer.zhang/proj-demo` doesn't exist。

**原因**：Dashboard SSE 传入 `?directory=/home/lancer.zhang/proj-demo`，但容器只挂载了 `/workspace`。

**修复**：增加 volume mount：
```bash
-v /home/lancer.zhang/proj-demo:/home/lancer.zhang/proj-demo
```

### 3. 容器内缺少 bun 运行时

**现象**：`exec: "bun": executable file not found in $PATH`。

**原因**：运行中的容器使用的是旧镜像（bun 未安装或 PATH 未生效）。

**修复**：用代理参数重新构建镜像：
```bash
docker build --build-arg http_proxy=http://proxy.nioint.com:8080 \
  --build-arg https_proxy=http://proxy.nioint.com:8080 \
  -t opencode-serve /home/lancer.zhang/opencode-docker/
```

### 4. Agent 不识别 TDD Pipeline Skills

**现象**：agent 报 "skills don't exist in this environment"，退回询问用户。

**原因**：opencode skill loader 从工作目录的 `.opencode/skills/` 加载 skills。目标项目目录 `proj-demo` 下没有 TDD skills。

**修复**：
1. 在 `oh-my-openagent/.opencode/skills/` 下创建 4 个 TDD skills
2. 在 `proj-demo/.opencode/` 下创建符号链接指向 workspace skills：
```bash
docker exec opencode-serve bash -c "
  mkdir -p /home/lancer.zhang/proj-demo/.opencode &&
  ln -s /workspace/.opencode/skills /home/lancer.zhang/proj-demo/.opencode/skills &&
  ln -s /workspace/.opencode/AGENTS.md /home/lancer.zhang/proj-demo/.opencode/AGENTS.md
"
```

### 5. Dashboard Stage 7/8 不亮

**现象**：TDD 循环实际完成但 Dashboard "Verified" 和 "Completed" 状态未更新。

**原因**：Dashboard 前端通过文本匹配检测 stage 转换，agent 输出中缺少触发关键词。

**修复**：`tdd-verification` skill 输出模板中加入：
- `closed-loop verified`、`all tests pass` → 触发 Stage 7
- `task complete`、`process finished` → 触发 Stage 8

### 6. Dashboard Layer 4 Oracle 不触发

**现象**：Four-Layer Verification 面板中 Oracle 层不激活。

**原因**：Dashboard 要求通过 `task`/`delegate-task` tool 且 input 包含 "oracle" 关键词触发。

**修复**：`tdd-verification` skill 增加 Gate 4，要求 agent 使用 `task` tool 执行 oracle cross-validation。

## 完整启动命令

```bash
sudo docker rm -f opencode-serve

sudo docker run -d \
  --name opencode-serve \
  --restart unless-stopped \
  -p 3001:3001 \
  -e http_proxy=http://proxy.nioint.com:8080 \
  -e https_proxy=http://proxy.nioint.com:8080 \
  -e no_proxy=localhost,127.0.0.1 \
  -v /home/lancer.zhang/oh-my-openagent:/workspace \
  -v /home/lancer.zhang/proj-demo:/home/lancer.zhang/proj-demo \
  -v /home/lancer.zhang/opencode-docker/opencode.json:/root/.config/opencode/opencode.json \
  opencode-serve
```

## 注意事项

1. **代理必须**：企业网络下容器访问外网 LLM API 必须配置代理
2. **镜像重建需代理**：`docker build` 时也需要 `--build-arg http_proxy=...`，否则 apt/curl 无法下载
3. **Skill 加载时机**：opencode serve 启动时加载 skills，修改 skill 文件后需 `docker restart opencode-serve`
4. **符号链接持久化**：`proj-demo/.opencode/` 下的 symlink 在容器内创建，因 volume mount 会持久化到宿主机
5. **新项目接入**：新目标项目目录需要同时满足：被 volume mount 进容器 + 目录下有 `.opencode/skills` 链接（或拷贝）
6. **Dashboard 关键词依赖**：skill 输出需包含特定关键词才能驱动 Dashboard UI 状态流转，修改时注意对照 `tdd-dashboard.html` 中的匹配逻辑
