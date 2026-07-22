@echo off
cd /d "%~dp0"

echo ============================================
echo  AI 工作流消息测试平台 V1
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js，请先安装 Node.js 18+
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node -v
echo.

if not exist "node_modules\pg\package.json" (
  echo [INFO] 正在安装首次运行所需依赖，请保持网络连接...
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] 依赖安装失败，请检查网络后重新启动应用
    echo.
    pause
    exit /b 1
  )
  echo [INFO] 依赖安装完成
  echo.
)

node --watch server.js

echo.
pause
