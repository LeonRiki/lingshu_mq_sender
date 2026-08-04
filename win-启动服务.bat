@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  AI Workflow Message Test Platform V1
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [INFO] Node.js was not found. Installing Node.js LTS...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Windows Package Manager (winget) was not found.
    echo Install Node.js 18 or later from https://nodejs.org/ and run this file again.
    echo.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js installation did not complete. Restart Windows and run this file again.
    echo.
    pause
    exit /b 1
  )
)

node -v
echo.

if not exist "node_modules\pg\package.json" (
  echo [INFO] Installing required dependencies. Please keep the network connected...
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Check the network and restart the app.
    echo.
    pause
    exit /b 1
  )
  echo [INFO] Dependencies installed.
  echo.
)

node --watch server.js

echo.
pause
