#!/bin/bash
# TDD Dashboard + OpenCode Serve 一键部署脚本
# 目标机器: 10.132.108.68 (CentOS 7, Docker available)
# 执行方式: bash deploy-68.sh

set -e

DEPLOY_DIR="/home/lancer.zhang"
REPO_DIR="$DEPLOY_DIR/oh-my-openagent"
DOCKER_DIR="$DEPLOY_DIR/opencode-docker"
DASHBOARD_PORT=8080
OPENCODE_PORT=3001
HOST_IP="10.132.108.68"

echo "=== TDD Dashboard + OpenCode Serve 部署 ==="

# 1. 确认仓库已 clone 并在 tdd-loop 分支
echo "[1/5] 检查代码仓库..."
cd "$REPO_DIR"
git checkout tdd-loop
git pull origin tdd-loop 2>/dev/null || true
echo "  ✓ 代码就绪: $(pwd) (branch: $(git branch --show-current))"

# 2. 修改 Dashboard 默认 Server URL 指向本机 opencode serve
echo "[2/5] 配置 Dashboard 默认连接地址..."
sed -i "s|http://127.0.0.1:8080|http://${HOST_IP}:${OPENCODE_PORT}|g" "$REPO_DIR/tdd-dashboard.html"
echo "  ✓ Dashboard 默认连接: http://${HOST_IP}:${OPENCODE_PORT}"

# 3. 创建 opencode Docker 配置
echo "[3/5] 准备 OpenCode Docker 镜像..."
mkdir -p "$DOCKER_DIR"

cat > "$DOCKER_DIR/opencode.json" << 'JSONEOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "zhipuai": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "智谱AI Coding",
      "options": {
        "baseURL": "https://open.bigmodel.cn/api/coding/paas/v4",
        "apiKey": "5920f4fae4c4448e9b9789b360a2fb4c.cezqLK9T60yfqZOV"
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
JSONEOF

cat > "$DOCKER_DIR/Dockerfile" << 'DKEOF'
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y curl ca-certificates && \
    curl -fsSL https://opencode.ai/install | bash && \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /root/.config/opencode /workspace
COPY opencode.json /root/.config/opencode/opencode.json
WORKDIR /workspace
EXPOSE 3001
CMD ["/root/.opencode/bin/opencode", "serve", "--port", "3001", "--hostname", "0.0.0.0", "--cors", "http://10.132.108.68:8080"]
DKEOF

# Build docker image
sudo docker build -t opencode-serve "$DOCKER_DIR"
echo "  ✓ Docker 镜像构建完成"

# 4. 启动服务
echo "[4/5] 启动服务..."

# 停止已有容器和进程
sudo docker rm -f opencode-serve 2>/dev/null || true
pkill -f "python3 -m http.server $DASHBOARD_PORT" 2>/dev/null || true
sleep 1

# 启动 opencode serve (Docker)
sudo docker run -d \
  --name opencode-serve \
  --restart unless-stopped \
  -p ${OPENCODE_PORT}:3001 \
  -v "$REPO_DIR:/workspace" \
  opencode-serve
echo "  ✓ OpenCode Serve 启动: http://${HOST_IP}:${OPENCODE_PORT}"

# 启动 Dashboard (python3 http server)
cd "$REPO_DIR"
nohup python3 -m http.server $DASHBOARD_PORT --bind 0.0.0.0 > /tmp/dashboard.log 2>&1 &
echo "  ✓ Dashboard 启动: http://${HOST_IP}:${DASHBOARD_PORT}/tdd-dashboard.html"

# 5. 验证
echo "[5/5] 验证服务..."
sleep 3

DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${DASHBOARD_PORT}/tdd-dashboard.html" 2>/dev/null)
OC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OPENCODE_PORT}/" 2>/dev/null)

echo "  Dashboard (port $DASHBOARD_PORT): HTTP $DASH_STATUS"
echo "  OpenCode  (port $OPENCODE_PORT): HTTP $OC_STATUS"

if [ "$DASH_STATUS" = "200" ] && [ "$OC_STATUS" = "200" ]; then
  echo ""
  echo "=== ✓ 部署成功 ==="
  echo "  Dashboard: http://${HOST_IP}:${DASHBOARD_PORT}/tdd-dashboard.html"
  echo "  OpenCode:  http://${HOST_IP}:${OPENCODE_PORT}"
  echo ""
  echo "  使用方法:"
  echo "    1. 浏览器打开 Dashboard 地址"
  echo "    2. 粘贴 PRD 内容"
  echo "    3. 点击 Start TDD"
else
  echo ""
  echo "=== ✗ 部署异常，请检查日志 ==="
  echo "  Dashboard log: /tmp/dashboard.log"
  echo "  OpenCode log:  sudo docker logs opencode-serve"
fi
