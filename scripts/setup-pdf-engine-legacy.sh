#!/usr/bin/env bash
# Legacy Python sidecar (optional — app uses in-process pdfium-native by default).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENGINE_DIR="$PROJECT_DIR/services/pdf-engine"
VENV="$ENGINE_DIR/.venv"
FONTS_DIR="$ENGINE_DIR/fonts"

echo "==> Setting up legacy Python PDF engine at $ENGINE_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Install: sudo dnf install python3 python3-pip"
  exit 1
fi

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$ENGINE_DIR/requirements.txt"

mkdir -p "$FONTS_DIR"
echo "Done. Legacy CLI: $VENV/bin/python $ENGINE_DIR/cli.py extract /path/to/file.pdf"
