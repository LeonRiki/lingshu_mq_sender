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
node --watch server.js

echo.
pause
