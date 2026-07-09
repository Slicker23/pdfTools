#!/usr/bin/env bash
# One-command dev startup for PdfFlow.
# Ensures Postgres, Redis, and Ollama are running, then starts the worker + Next.js dev server.
# Usage: npm run start:dev   (or ./scripts/dev.sh)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

ensure_service() {
  local svc="$1"
  if systemctl is-active --quiet "$svc"; then
    green "  ✓ $svc is running"
    return 0
  fi
  yellow "  … starting $svc (may ask for sudo password)"
  if sudo systemctl start "$svc"; then
    green "  ✓ $svc started"
  else
    red "  ✗ could not start $svc"
    return 1
  fi
}

echo "==> Checking system services"
ensure_service postgresql
ensure_service redis
ensure_service ollama

echo "==> Checking Postgres connection"
if PGPASSWORD=pdfflow psql -h 127.0.0.1 -U pdfflow -d pdfflow -c '\q' >/dev/null 2>&1; then
  green "  ✓ database reachable"
else
  red "  ✗ database not reachable — run: sudo ./scripts/setup-postgres-fedora.sh"
fi

echo "==> Checking Ollama model: $OLLAMA_MODEL"
if curl -s -m 3 http://127.0.0.1:11434/api/tags | grep -q "\"$OLLAMA_MODEL"; then
  green "  ✓ model $OLLAMA_MODEL available"
else
  yellow "  ! model $OLLAMA_MODEL not found — AI tools need: ollama pull $OLLAMA_MODEL"
fi

WORKER_PID=""
cleanup() {
  echo ""
  echo "==> Shutting down"
  if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null
    green "  ✓ dev worker stopped"
  fi
}
trap cleanup EXIT INT TERM

echo "==> Background job worker"
if systemctl is-active --quiet pdftools-worker 2>/dev/null; then
  yellow "  … restarting pdftools-worker (loads latest job handlers)"
  if sudo systemctl restart pdftools-worker; then
    green "  ✓ pdftools-worker restarted"
  else
    red "  ✗ could not restart pdftools-worker — run: sudo systemctl restart pdftools-worker"
  fi
elif [ -x "$ROOT/node_modules/.bin/tsx" ]; then
  "$ROOT/node_modules/.bin/tsx" src/worker/index.ts &
  WORKER_PID=$!
  green "  ✓ dev worker started (pid $WORKER_PID)"
else
  yellow "  ! tsx not found — run npm install; server jobs will not run"
fi

echo "==> Starting Next.js dev server (Ctrl+C to stop everything)"
npm run dev
