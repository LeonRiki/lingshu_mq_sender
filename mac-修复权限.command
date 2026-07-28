#!/bin/bash
cd "$(dirname "$0")"

echo "正在修复 macOS 启动权限..."

xattr -d com.apple.quarantine mac-启动服务.command 2>/dev/null
xattr -d com.apple.quarantine mac-修复权限.command 2>/dev/null
chmod +x mac-启动服务.command mac-修复权限.command

echo "修复完成。现在可以双击 mac-启动服务.command 启动服务。"
read -p "按回车键退出..."
