#!/usr/bin/env bash
# Fedora: Redis, LibreOffice, OCR tools, job storage dir, and systemd worker unit.
# Run: sudo ./scripts/setup-worker-fedora.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STORAGE_DIR="${LOCAL_STORAGE_PATH:-/var/lib/pdfflow/jobs}"
RUN_USER="${SUDO_USER:-${USER:-alex}}"
RUN_GROUP="$(id -gn "$RUN_USER" 2>/dev/null || echo "$RUN_USER")"
ENV_SRC="$PROJECT_DIR/.env.local"
ENV_DST="/etc/pdfflow/pdftools-worker.env"

echo "==> Installing packages (Redis, LibreOffice, OCR, Python)..."
dnf install -y redis libreoffice libreoffice-pdfimport tesseract tesseract-langpack-eng \
  tesseract-langpack-ita ocrmypdf ghostscript python3 python3-pip dejavu-sans-fonts || true

echo "==> Enabling Redis..."
systemctl enable --now redis || systemctl enable --now redis6 || true

echo "==> Creating job storage directory: $STORAGE_DIR"
mkdir -p "$STORAGE_DIR"
chown "$RUN_USER:$RUN_GROUP" "$STORAGE_DIR"

echo "==> Fixing project ownership ($RUN_USER:$RUN_GROUP)..."
chown -R "$RUN_USER:$RUN_GROUP" "$PROJECT_DIR"
chmod +x "$PROJECT_DIR/scripts/run-worker.sh"

echo "==> Installing worker environment at $ENV_DST"
mkdir -p /etc/pdfflow
if [ -f "$ENV_SRC" ]; then
  cp "$ENV_SRC" "$ENV_DST"
else
  cat >"$ENV_DST" <<EOF
DATABASE_URL=postgresql://pdfflow:pdfflow@127.0.0.1:5432/pdfflow
REDIS_URL=redis://127.0.0.1:6379
LOCAL_STORAGE_PATH=$STORAGE_DIR
EOF
  echo "    Warning: $ENV_SRC not found — edit $ENV_DST before starting the worker"
fi
chown root:"$RUN_GROUP" "$ENV_DST"
chmod 640 "$ENV_DST"

echo "==> PDF edit engine: bundled via npm (pdfium-native). Run npm install in project."
echo "    Optional legacy Python CLI: bash $PROJECT_DIR/scripts/setup-pdf-engine-legacy.sh"

echo "==> Installing /usr/local/bin/pdfflow-worker (SELinux-safe launcher)"
RUN_HOME="$(eval echo "~$RUN_USER")"
cat > /usr/local/bin/pdfflow-worker <<EOF
#!/usr/bin/bash
set -euo pipefail
ROOT="$PROJECT_DIR"
cd "\$ROOT"
export HOME="$RUN_HOME"
export NVM_DIR="\$HOME/.nvm"
if [ -s "\$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "\$NVM_DIR/nvm.sh"
fi
exec "\$ROOT/node_modules/.bin/tsx" "\$ROOT/src/worker/index.ts"
EOF
chmod 755 /usr/local/bin/pdfflow-worker
chown root:root /usr/local/bin/pdfflow-worker
restorecon -v /usr/local/bin/pdfflow-worker 2>/dev/null || true

UNIT_SRC="$PROJECT_DIR/deploy/pdftools-worker.service"
UNIT_DST="/etc/systemd/system/pdftools-worker.service"

if [ -f "$UNIT_SRC" ]; then
  echo "==> Installing systemd unit..."
  sed -e "s|/home/alex/Desktop/pdfTools|$PROJECT_DIR|g" \
      -e "s|^User=alex|User=$RUN_USER|" \
      -e "s|^Group=alex|Group=$RUN_GROUP|" \
      "$UNIT_SRC" > /tmp/pdftools-worker.service
  cp /tmp/pdftools-worker.service "$UNIT_DST"
  systemctl daemon-reload
  echo "    Installed $UNIT_DST"
else
  echo "    Skip systemd unit (deploy/pdftools-worker.service not found)"
fi

echo ""
echo "==> DB migration (server_jobs_reset_at) — run as postgres superuser if needed:"
echo "    sudo -u postgres psql pdfflow -c \"ALTER TABLE users ADD COLUMN IF NOT EXISTS server_jobs_reset_at timestamp;\""
echo ""
echo "Done. Start worker with:"
echo "  sudo systemctl enable --now pdftools-worker"
echo "  sudo systemctl status pdftools-worker"
echo ""
echo "Dev fallback: cd $PROJECT_DIR && npm run worker"
