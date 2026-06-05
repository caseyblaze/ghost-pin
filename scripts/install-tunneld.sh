#!/usr/bin/env bash
# Install pymobiledevice3 remote tunneld as a root LaunchDaemon so it
# auto-starts at boot and auto-restarts on crash. Run once with sudo.
set -euo pipefail

LABEL="com.ghostpin.tunneld"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/$LABEL.plist"
PLIST_DST="/Library/LaunchDaemons/$LABEL.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "請用 sudo 執行：sudo $0" >&2
  exit 1
fi

# Resolve the absolute pymobiledevice3 binary (must be on the invoking user's PATH).
PMD3_BIN="$(command -v pymobiledevice3 || true)"
if [ -z "$PMD3_BIN" ]; then
  PMD3_BIN="$(sudo -u "${SUDO_USER:-$USER}" bash -lc 'command -v pymobiledevice3' || true)"
fi
if [ -z "$PMD3_BIN" ]; then
  echo "找不到 pymobiledevice3，請先 pipx install pymobiledevice3" >&2
  exit 1
fi

sed "s#__PMD3_BIN__#$PMD3_BIN#" "$PLIST_SRC" > "$PLIST_DST"
chown root:wheel "$PLIST_DST"
chmod 644 "$PLIST_DST"

# Reload if already present, then bootstrap.
launchctl bootout system "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap system "$PLIST_DST"
launchctl enable "system/$LABEL"

echo "✓ tunneld LaunchDaemon 已安裝並啟動（$PMD3_BIN）"
echo "  查看狀態： launchctl print system/$LABEL"
echo "  查看日誌： tail -f /tmp/ghostpin-tunneld.log"
