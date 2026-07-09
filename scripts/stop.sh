#!/usr/bin/env bash
# Stop PdfFlow dev processes (Next.js dev server + BullMQ worker).
# System services (Postgres, Redis, Ollama) are left running.
# Usage: npm run stop:dev   (or ./scripts/stop.sh)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stopped=0

# Next.js dev server
if pkill -f "next dev" 2>/dev/null; then
  echo "  ✓ stopped Next.js dev server"
  stopped=1
fi

# BullMQ worker
if pkill -f "src/worker/index.ts" 2>/dev/null; then
  echo "  ✓ stopped job worker"
  stopped=1
fi

if [ "$stopped" -eq 0 ]; then
  echo "  nothing to stop"
fi

echo ""
echo "System services left running. To stop them too:"
echo "  sudo systemctl stop postgresql redis ollama"
