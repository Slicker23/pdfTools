#!/usr/bin/env bash
# Install Ollama and pull the default model for PdfFlow AI tools (free, local, no API key).
set -euo pipefail

MODEL="${OLLAMA_MODEL:-llama3.2}"

echo "==> Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

echo "==> Enabling Ollama service..."
sudo systemctl enable --now ollama

echo "==> Pulling model: ${MODEL} (this may take a few minutes)..."
ollama pull "${MODEL}"

echo ""
echo "Done. Add to .env.local (optional — these are the defaults):"
echo "  OLLAMA_BASE_URL=http://127.0.0.1:11434"
echo "  OLLAMA_MODEL=${MODEL}"
echo ""
echo "Test: curl http://127.0.0.1:11434/api/tags"
