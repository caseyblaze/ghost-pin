#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if needed
if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
  echo "→ Installing server dependencies..."
  npm install --prefix "$SCRIPT_DIR/server"
fi
if [ ! -d "$SCRIPT_DIR/app/node_modules" ]; then
  echo "→ Installing app dependencies..."
  npm install --prefix "$SCRIPT_DIR/app"
fi

# Start tunneld on demand (needs root). It is torn down on exit, so the iOS
# tunnel only exists while you're actually using Ghost-Pin. One password
# prompt per run. If a tunneld is already running (e.g. installed as a
# permanent LaunchDaemon), reuse it and leave it alone.
STARTED_TUNNELD=0
if pgrep -f "pymobiledevice3 remote tunneld" >/dev/null; then
  echo "→ tunneld 已在運行，沿用現有的"
else
  echo "→ 啟動 tunneld（需要 root，請輸入密碼）..."
  sudo -v
  sudo pymobiledevice3 remote tunneld >/tmp/ghostpin-tunneld.log 2>&1 &
  STARTED_TUNNELD=1
fi

# Start server in background. Clean up server + our tunneld when this exits.
echo "→ Starting server on :3000..."
npm start --prefix "$SCRIPT_DIR/server" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  if [ "$STARTED_TUNNELD" -eq 1 ]; then
    echo "→ 收掉 tunneld..."
    sudo pkill -f "pymobiledevice3 remote tunneld" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait briefly for tunneld to come up so the first location set is snappy
# (the daemon would retry anyway, but this avoids an initial failure).
if [ "$STARTED_TUNNELD" -eq 1 ]; then
  printf "→ 等待 tunneld 就緒"
  for _ in $(seq 1 15); do
    if curl -s -o /dev/null "http://127.0.0.1:49151"; then break; fi
    printf "."
    sleep 1
  done
  echo
fi

# Write LAN IP to app/src/config.ts
bash "$SCRIPT_DIR/scripts/set-ip.sh"

# Start Expo (foreground — shows QR code)
echo "→ Starting Expo..."
cd "$SCRIPT_DIR/app" && npx expo start
