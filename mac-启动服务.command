#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo " AI 工作流消息测试平台 V1"
echo "============================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 Node.js，请先安装 Node.js 18+"
  echo "https://nodejs.org/"
  echo ""
  read -p "按回车键退出..."
  exit 1
fi

node -v
echo ""
node --watch server.js

echo ""
read -p "服务已停止，按回车键退出..."
