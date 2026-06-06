#!/usr/bin/env bash
# Remove the tunneld LaunchDaemon installed by install-tunneld.sh, returning to
# on-demand operation (start.sh starts tunneld only while it runs). Run with sudo.
set -euo pipefail

LABEL="com.ghostpin.tunneld"
PLIST_DST="/Library/LaunchDaemons/${LABEL}.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "請用 sudo 執行：sudo $0" >&2
  exit 1
fi

launchctl bootout "system/${LABEL}" 2>/dev/null || true
launchctl bootout system "${PLIST_DST}" 2>/dev/null || true
rm -f "${PLIST_DST}"

echo "✓ 已移除 tunneld LaunchDaemon（${PLIST_DST}）"
echo "  之後改由 ./start.sh 按需啟動 tunneld（啟動時會要一次密碼）。"
