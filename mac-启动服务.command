#!/bin/bash
cd "$(dirname "$0")"

echo "============================================"
echo " AI 工作流消息测试平台 V1"
echo "============================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[INFO] 未检测到 Node.js，正在安装..."

  if ! command -v brew >/dev/null 2>&1; then
    echo "[INFO] 未检测到 Homebrew，正在安装..."
    if ! /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
      echo "[ERROR] Homebrew 安装失败，请检查网络和系统权限后重新启动应用"
      echo ""
      read -p "按回车键退出..."
      exit 1
    fi

    if [ -x "/opt/homebrew/bin/brew" ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x "/usr/local/bin/brew" ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi

  if ! brew install node; then
    echo "[ERROR] Node.js 安装失败，请检查网络后重新启动应用"
    echo ""
    read -p "按回车键退出..."
    exit 1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js 安装完成，但当前终端未找到 Node.js。请重新启动应用。"
    echo ""
    read -p "按回车键退出..."
    exit 1
  fi
fi

node -v
echo ""

if [ ! -f "node_modules/pg/package.json" ]; then
  echo "[INFO] 正在安装首次运行所需依赖，请保持网络连接..."
  if ! npm ci --omit=dev --no-audit --no-fund; then
    echo "[ERROR] 依赖安装失败，请检查网络后重新启动应用"
    echo ""
    read -p "按回车键退出..."
    exit 1
  fi
  echo "[INFO] 依赖安装完成"
  echo ""
fi

node --watch server.js

echo ""
read -p "服务已停止，按回车键退出..."
