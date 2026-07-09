#!/usr/bin/env bash
# Remove a Docker "ghost" web container that keeps port 3000 after compose down / reboot.
# Docker Desktop may show web-1 as Created/stuck while an old container still runs
# next-server via containerd with restart=unless-stopped.
#
# Usage: sudo ./scripts/kill-ghost-port-3000.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GHOST_ID="b73979ed61f3fac09f817cc4534648712a105536499cfd8a18c010e850208354"
GHOST_DIR="/var/lib/docker/containers/${GHOST_ID}"

port_in_use() {
  ss -tln | grep -q ':3000 '
}

echo "==> Port 3000 before cleanup"
ss -tlnp | grep ':3000' || echo "  (none)"

echo "==> Ghost containerd shim (if any)"
pgrep -af "containerd-shim.*${GHOST_ID:0:12}" || echo "  (shim not found)"

if command -v ctr >/dev/null 2>&1 && systemctl is-active --quiet docker; then
  echo "==> Stopping ghost via ctr (namespace moby)"
  ctr -n moby tasks kill -s SIGKILL "$GHOST_ID" 2>/dev/null || true
  sleep 1
  ctr -n moby tasks delete "$GHOST_ID" 2>/dev/null || true
  ctr -n moby containers delete "$GHOST_ID" 2>/dev/null || true
fi

if port_in_use; then
  echo "==> Port still bound — stopping Docker to remove ghost metadata from disk"
  echo "    (Do NOT restart Docker before deleting — that recreates the ghost.)"
  systemctl stop docker docker.socket 2>/dev/null || systemctl stop docker 2>/dev/null || true

  pkill -f "containerd-shim.*${GHOST_ID:0:12}" 2>/dev/null || true
  pkill -f 'docker-proxy.*host-port 3000' 2>/dev/null || true

  if [ -d "$GHOST_DIR" ]; then
    echo "==> Removing ghost container data: $GHOST_DIR"
    rm -rf "$GHOST_DIR"
  else
    echo "==> Ghost dir not found at $GHOST_DIR"
    echo "    Searching for other orphan containers publishing :3000…"
    for dir in /var/lib/docker/containers/*/; do
      [ -f "${dir}hostconfig.json" ] || continue
      if grep -q '"3000/tcp"' "${dir}hostconfig.json" 2>/dev/null; then
        cid="$(basename "$dir")"
        echo "    Removing orphan $cid"
        rm -rf "$dir"
      fi
    done
  fi

  echo "==> Starting Docker"
  systemctl start docker
  sleep 2
fi

echo "==> Result"
if port_in_use; then
  ss -tlnp | grep ':3000' || true
  echo ""
  echo "FAILED: port 3000 still bound."
  echo "Try: sudo systemctl stop docker docker.socket"
  echo "     sudo rm -rf /var/lib/docker/containers/${GHOST_ID}"
  echo "     sudo systemctl start docker"
  exit 1
fi

echo "OK: port 3000 is free."

echo "==> Removing stuck pdfflow-web-1 container (Created state)"
cd "$ROOT"
docker rm -f pdfflow-web-1 2>/dev/null || docker compose rm -f web 2>/dev/null || true

echo ""
echo "Start the stack:"
echo "  cd $ROOT"
echo "  docker compose up -d"
