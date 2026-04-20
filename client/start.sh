#!/usr/bin/env bash
set -e

# ============================================
# OpenGUI Client — 编译安装脚本
# ============================================

cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --------------------------------------------------
# 1. 检查前置依赖
# --------------------------------------------------
command -v adb >/dev/null 2>&1 || error "需要 adb，请安装 Android SDK Platform Tools"
command -v java >/dev/null 2>&1 || error "需要 Java 17+，请先安装"

# 检查设备连接
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  error "未检测到 Android 设备，请通过 USB 连接手机并开启 USB 调试"
fi
info "检测到 ${DEVICE_COUNT} 台设备"

# --------------------------------------------------
# 2. adb 端口转发
# --------------------------------------------------
adb reverse tcp:7777 tcp:7777 >/dev/null 2>&1
info "端口转发已设置 (tcp:7777)"

# --------------------------------------------------
# 3. 编译 APK
# --------------------------------------------------
warn "编译 APK ..."
./gradlew assembleDebug -q

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_PATH" ]; then
  error "APK 编译失败，未找到 $APK_PATH"
fi
info "APK 编译完成"

# --------------------------------------------------
# 4. 安装到设备
# --------------------------------------------------
warn "安装到设备 ..."
adb install -r "$APK_PATH"
info "安装完成"

# --------------------------------------------------
# 5. 启动 app
# --------------------------------------------------
PACKAGE="com.haomai.promotor"
adb shell am start -n "$PACKAGE/.login.SplashActivity" >/dev/null 2>&1
info "App 已启动"

echo ""
echo "  确保 server 已在运行: cd ../server && ./start.sh"
echo ""
