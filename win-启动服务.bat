@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  AI Workflow Message Test Platform V1
echo ============================================
echo.

set "NODE_RUNTIME_DIR=%LOCALAPPDATA%\LingshuMQSender\node"
if exist "%NODE_RUNTIME_DIR%\node.exe" set "PATH=%NODE_RUNTIME_DIR%;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto :install_portable_node
goto :node_ready

:install_portable_node
echo [INFO] Node.js was not found. Installing a portable Node.js LTS runtime...
where powershell >nul 2>nul
if errorlevel 1 goto :powershell_missing

set "NODE_ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_ARCH=arm64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" set "NODE_ARCH=x86"
if /I "%PROCESSOR_ARCHITEW6432%"=="AMD64" set "NODE_ARCH=x64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NODE_ARCH=arm64"
set "NODE_ARCHIVE=%TEMP%\lingshu-node-%RANDOM%%RANDOM%.zip"
set "NODE_STAGE=%TEMP%\lingshu-node-%RANDOM%%RANDOM%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $arch=$env:NODE_ARCH; $client=New-Object Net.WebClient; $client.Headers['User-Agent']='LingshuMQSender'; $releases=ConvertFrom-Json ($client.DownloadString('https://nodejs.org/dist/index.json')); $wanted='win-' + $arch + '-zip'; $release=$null; foreach($item in $releases){ if($item.lts -and $item.files -contains $wanted){ $release=$item; break } }; if(-not $release -and $arch -eq 'arm64'){ $arch='x64'; $wanted='win-x64-zip'; foreach($item in $releases){ if($item.lts -and $item.files -contains $wanted){ $release=$item; break } } }; if(-not $release){ throw 'No compatible Node.js LTS archive was found.' }; $url='https://nodejs.org/dist/' + $release.version + '/node-' + $release.version + '-win-' + $arch + '.zip'; Write-Host ('[INFO] Downloading ' + $url); $client.DownloadFile($url,$env:NODE_ARCHIVE); if(Test-Path $env:NODE_STAGE){ Remove-Item $env:NODE_STAGE -Recurse -Force }; Expand-Archive $env:NODE_ARCHIVE $env:NODE_STAGE -Force; $source=Get-ChildItem $env:NODE_STAGE -Directory | Select-Object -First 1; if(-not $source -or -not (Test-Path (Join-Path $source.FullName 'node.exe'))){ throw 'Downloaded Node.js archive is invalid.' }; New-Item -Path (Split-Path $env:NODE_RUNTIME_DIR) -ItemType Directory -Force | Out-Null; if(Test-Path $env:NODE_RUNTIME_DIR){ Remove-Item $env:NODE_RUNTIME_DIR -Recurse -Force }; Move-Item $source.FullName $env:NODE_RUNTIME_DIR; Remove-Item $env:NODE_ARCHIVE -Force; Remove-Item $env:NODE_STAGE -Recurse -Force"
if errorlevel 1 goto :node_download_failed

set "PATH=%NODE_RUNTIME_DIR%;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :node_not_available

:node_ready
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 goto :install_portable_node

node -v
echo.

node -e "require('pg')" >nul 2>nul
if not errorlevel 1 goto :start_server

echo [INFO] Installing required dependencies. Please keep the network connected...
if not exist "package-lock.json" goto :dependency_install_failed
where npm >nul 2>nul
if errorlevel 1 goto :dependency_install_failed
call npm ci --omit=dev --no-audit --no-fund --fetch-retries=3
if errorlevel 1 goto :dependency_install_failed
node -e "require('pg')" >nul 2>nul
if errorlevel 1 goto :dependency_install_failed
echo [INFO] Dependencies installed.
echo.

:start_server
node --watch server.js

echo.
pause
exit /b 0

:powershell_missing
echo [ERROR] PowerShell was not found. Install Node.js 18 or later and run this file again.
goto :startup_failed

:node_download_failed
echo [ERROR] Downloading or extracting the portable Node.js LTS runtime failed.
echo Check the network, available disk space, and PowerShell permissions, then restart the app.
goto :startup_failed

:node_not_available
echo [ERROR] The portable Node.js runtime was prepared, but node.exe was not found.
goto :startup_failed

:dependency_install_failed
echo [ERROR] Dependency installation failed. Check the network and restart the app.

:startup_failed
echo.
pause
exit /b 1
