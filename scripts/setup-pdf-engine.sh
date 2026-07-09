#!/usr/bin/env bash
# PDF edit engine — Node.js (pdfium-native + pdf-lib) is bundled with npm install.
# Optional: legacy Python sidecar in services/pdf-engine/ for manual CLI testing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> PDF edit engine runs in-process via pdfium-native (npm install)"
echo ""
echo "Verify:"
echo "  PDF_PATH=tests/fixtures/cv-like.pdf bash $SCRIPT_DIR/pdf-engine-smoke.sh"
echo ""
echo "Optional legacy Python CLI (services/pdf-engine/.venv):"
echo "  bash $SCRIPT_DIR/setup-pdf-engine-legacy.sh"
