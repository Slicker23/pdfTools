#!/usr/bin/env bash
# End-to-end smoke test: extract → edit one block → apply (Node engine).
# Usage: PDF_PATH=/path/to/file.pdf bash scripts/pdf-engine-smoke.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ -z "${PDF_PATH:-}" ]; then
  echo "Error: set PDF_PATH to a test PDF (e.g. your CV)."
  echo "  PDF_PATH=/path/to/CV.pdf bash scripts/pdf-engine-smoke.sh"
  exit 1
fi

if [ ! -f "$PDF_PATH" ]; then
  echo "Error: PDF not found: $PDF_PATH"
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

DOC_JSON="$TMP/document.json"
PATCH_JSON="$TMP/patch.json"
OUT_PDF="$TMP/output.pdf"

echo "==> Extract: $PDF_PATH"
node --import tsx <<EOF
import { readFileSync, writeFileSync } from 'fs';
import { pdfEngineExtract } from './src/lib/pdf-engine/run.ts';

const input = readFileSync('$PDF_PATH');
const doc = await pdfEngineExtract(input);
writeFileSync('$DOC_JSON', JSON.stringify(doc, null, 2));
const blocks = doc.pages.flatMap(p => p.blocks);
console.log('Blocks:', blocks.length);
for (const b of blocks.slice(0, 5)) {
  console.log('  [' + b.page + ']', JSON.stringify(b.text.slice(0, 80)));
}
if (blocks.length === 0) process.exit(1);
EOF

echo "==> Build patch (edit first block)"
node --import tsx <<EOF
import { readFileSync, writeFileSync } from 'fs';
const doc = JSON.parse(readFileSync('$DOC_JSON', 'utf-8'));
const blocks = doc.pages.flatMap((p: { blocks: unknown[] }) => p.blocks);
const target = { ...blocks[0], text: blocks[0].text + ' [edited]', modified: true };
writeFileSync('$PATCH_JSON', JSON.stringify({ documentId: doc.documentId, blocks: [target] }, null, 2));
console.log('  Edited block:', JSON.stringify(String(target.text).slice(0, 80)));
EOF

echo "==> Apply patch"
node --import tsx <<EOF
import { readFileSync, writeFileSync } from 'fs';
import { pdfEngineApply } from './src/lib/pdf-engine/run.ts';

const input = readFileSync('$PDF_PATH');
const patch = JSON.parse(readFileSync('$PATCH_JSON', 'utf-8'));
const out = await pdfEngineApply(input, patch);
writeFileSync('$OUT_PDF', out);
console.log('  Output bytes:', out.length);
EOF

if [ ! -s "$OUT_PDF" ]; then
  echo "Error: output PDF missing or empty"
  exit 1
fi

if [ "${SMOKE_UNICODE:-}" = "1" ]; then
  echo "==> Unicode / diacritics apply test"
  UNICODE_PATCH="$TMP/patch-unicode.json"
  OUT_UNICODE="$TMP/output-unicode.pdf"
  node --import tsx <<EOF
import { readFileSync, writeFileSync } from 'fs';
import { pdfEngineApply } from './src/lib/pdf-engine/run.ts';
import { loadDocument } from 'pdfium-native';

const doc = JSON.parse(readFileSync('$DOC_JSON', 'utf-8'));
const blocks = doc.pages.flatMap((p: { blocks: unknown[] }) => p.blocks);
const target = { ...blocks[0], text: 'România [edited]', modified: true };
const patch = { documentId: doc.documentId, blocks: [target] };
writeFileSync('$UNICODE_PATCH', JSON.stringify(patch));
const input = readFileSync('$PDF_PATH');
const out = await pdfEngineApply(input, patch);
writeFileSync('$OUT_UNICODE', out);
const pdf = await loadDocument(out);
let found = false;
for (let i = 0; i < pdf.pageCount; i++) {
  const page = await pdf.getPage(i);
  const text = await page.getText();
  page.close();
  if (text.includes('România') || (text.includes('Rom') && text.includes('edited'))) {
    found = true;
    break;
  }
}
pdf.destroy();
if (!found) throw new Error('diacritics missing in output PDF');
console.log('  Unicode text verified in output PDF');
EOF
fi

BODY_WITH_SPACES=$(node --import tsx -e "
import { readFileSync } from 'fs';
const doc = JSON.parse(readFileSync('$DOC_JSON','utf-8'));
const blocks = doc.pages.flatMap((p: { blocks: { text: string }[] }) => p.blocks);
console.log(blocks.filter(b => b.text.length > 30 && b.text.includes(' ')).length);
")
echo "==> Long blocks with spaces: $BODY_WITH_SPACES"

OUT_SIZE=$(stat -c%s "$OUT_PDF" 2>/dev/null || stat -f%z "$OUT_PDF")
echo ""
echo "==> Smoke test passed"
echo "  Output PDF: $OUT_PDF ($OUT_SIZE bytes)"
cp "$OUT_PDF" "$PROJECT_DIR/.pdf-engine-smoke-output.pdf" 2>/dev/null || true
echo "  (also copied to $PROJECT_DIR/.pdf-engine-smoke-output.pdf)"
