#!/usr/bin/env bash
# Apply server_jobs_reset_at without drizzle-kit push (avoids team_members ownership errors).
set -euo pipefail

DB_NAME="${1:-pdfflow}"

sudo -u postgres psql "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS server_jobs_reset_at timestamp;
SQL

echo "Applied server_jobs_reset_at on database: $DB_NAME"
