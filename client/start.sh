#!/usr/bin/env bash
set -e

# ============================================
# OpenGUI Client — build and install script
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
# 1. Check prerequisites
# --------------------------------------------------
command -v adb >/dev/null 2>&1 || error "adb is required. Please install Android SDK Platform Tools."
command -v java >/dev/null 2>&1 || error "Java 17+ is required. Please install it first."

# Check device connection
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  error "No Android device detected. Connect a phone over USB and enable USB debugging."
fi
info "Detected ${DEVICE_COUNT} device(s)"

# --------------------------------------------------
# 2. adb port forwarding
# --------------------------------------------------
adb reverse tcp:7777 tcp:7777 >/dev/null 2>&1
info "Port forwarding configured (tcp:7777)"

# --------------------------------------------------
# 3. Build APK
# --------------------------------------------------
warn "Building APK ..."
./gradlew assembleDebug -q

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_PATH" ]; then
  error "APK build failed. $APK_PATH was not found."
fi
info "APK build completed"

# --------------------------------------------------
# 4. Install on device
# --------------------------------------------------
warn "Installing on device ..."
adb install -r "$APK_PATH"
info "Install completed"

# --------------------------------------------------
# 5. Launch app
# --------------------------------------------------
PACKAGE="com.coremate.opengui"
adb shell am start -n "$PACKAGE/.login.SplashActivity" >/dev/null 2>&1
info "App launched"

echo ""
echo "  Make sure the server is running: cd ../server && ./start.sh"
echo ""
