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

# Start server in background, kill it when this script exits
echo "→ Starting server on :3000..."
npm start --prefix "$SCRIPT_DIR/server" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT

# Write LAN IP to app/src/config.ts
bash "$SCRIPT_DIR/scripts/set-ip.sh"

# Start Expo (foreground — shows QR code)
echo "→ Starting Expo..."
cd "$SCRIPT_DIR/app" && npx expo start
