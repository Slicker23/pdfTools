#!/usr/bin/env bash
# Systemd-friendly worker launcher (loads nvm when present).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

if [ -x "$ROOT/node_modules/.bin/tsx" ]; then
  exec "$ROOT/node_modules/.bin/tsx" src/worker/index.ts
fi

exec npm run worker
