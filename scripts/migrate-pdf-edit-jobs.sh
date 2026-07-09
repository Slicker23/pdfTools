#!/usr/bin/env bash
# Apply pdf_edit_extract / pdf_edit_apply job types (drizzle/0002_pdf_edit_jobs.sql).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_NAME="${1:-pdfflow}"

sudo -u postgres psql "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f "$PROJECT_DIR/drizzle/0002_pdf_edit_jobs.sql"

echo "Applied pdf_edit job types on database: $DB_NAME"
