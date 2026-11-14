@echo off
setlocal
chcp 65001 >nul
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
if exist "release\win-unpacked\手机控制电脑.exe" (
  start "" "release\win-unpacked\手机控制电脑.exe"
  exit /b
)
set "PCONTROL_NODE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PCONTROL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "node_modules\electron\dist\electron.exe" (
  echo 请先使用 Node.js 22.12+ 安装依赖，再运行本文件。
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  "%PCONTROL_NODE%" scripts\sync-phone.cjs
  "%PCONTROL_NODE%" node_modules\vite\bin\vite.js build
  if errorlevel 1 (pause & exit /b 1)
)
start "" "node_modules\electron\dist\electron.exe" .
