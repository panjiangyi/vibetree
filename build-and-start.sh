#!/usr/bin/env bash
set -euo pipefail

if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # Use the repository's .nvmrc so native modules match the runtime ABI.
  set +u
  # shellcheck source=/dev/null
  . "${HOME}/.nvm/nvm.sh"
  nvm use --silent >/dev/null
  set -u
fi

# Bind to all interfaces so the server is reachable from other devices on the WLAN.
export VIBETREE_HOST="${VIBETREE_HOST:-0.0.0.0}"
PORT="${VIBETREE_PORT:-3767}"

# Best-effort detection of this machine's LAN IP for a convenient connect URL.
lan_ip="$(node -e "const os=require('node:os'); for (const entries of Object.values(os.networkInterfaces())) for (const item of entries ?? []) if (item.family === 'IPv4' && !item.internal) { console.log(item.address); process.exit(0) }" 2>/dev/null || true)"

pnpm build

echo
echo "VibeTree server binding to ${VIBETREE_HOST}:${PORT}"
if [ -n "${lan_ip:-}" ]; then
  echo "Connect from other devices on the WLAN at: http://${lan_ip}:${PORT}"
fi
echo

pnpm --filter @vibetree/server start
