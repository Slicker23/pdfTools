#!/usr/bin/env bash
# Fix Fedora Postgres: password auth on localhost + create pdfflow db/user + apply schema.
# Run: sudo ./scripts/setup-postgres-fedora.sh

set -euo pipefail

PG_HBA="/var/lib/pgsql/data/pg_hba.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Initializing Postgres data directory (skip if already done)..."
if [ ! -f /var/lib/pgsql/data/PG_VERSION ]; then
  postgresql-setup --initdb
else
  echo "    Data dir already exists, skipping initdb."
fi

echo "==> Fix pg_hba.conf: replace ident with scram-sha-256 for localhost..."
if [ -f "$PG_HBA" ]; then
  cp -a "$PG_HBA" "${PG_HBA}.bak.$(date +%s)"
  sed -i \
    -e 's/^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+127\.0\.0\.1\/32[[:space:]]\+\)ident$/\1scram-sha-256/' \
    -e 's/^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+::1\/128[[:space:]]\+\)ident$/\1scram-sha-256/' \
    -e 's/^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+127\.0\.0\.1\/32[[:space:]]\+\)peer$/\1scram-sha-256/' \
    -e 's/^\(host[[:space:]]\+all[[:space:]]\+all[[:space:]]\+::1\/128[[:space:]]\+\)peer$/\1scram-sha-256/' \
    "$PG_HBA"
  echo "    Updated $PG_HBA (backup saved alongside)."
else
  echo "    ERROR: $PG_HBA not found" >&2
  exit 1
fi

echo "==> Starting Postgres..."
systemctl enable --now postgresql
systemctl reload postgresql 2>/dev/null || systemctl restart postgresql

echo "==> Creating user and database..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pdfflow') THEN
    CREATE USER pdfflow WITH PASSWORD 'pdfflow';
  ELSE
    ALTER USER pdfflow WITH PASSWORD 'pdfflow';
  END IF;
END
$$;
SELECT 'CREATE DATABASE pdfflow OWNER pdfflow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pdfflow')\gexec
SQL

echo "==> Applying schema..."
SCHEMA_TMP="/tmp/pdfflow-init-$$.sql"
cp "$PROJECT_DIR/drizzle/0000_init.sql" "$SCHEMA_TMP"
chmod 644 "$SCHEMA_TMP"
sudo -u postgres psql -d pdfflow -v ON_ERROR_STOP=1 -f "$SCHEMA_TMP"
rm -f "$SCHEMA_TMP"
sudo -u postgres psql -d pdfflow -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL ON SCHEMA public TO pdfflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pdfflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pdfflow;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pdfflow;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pdfflow;
SQL

echo ""
echo "==> Testing pdfflow TCP login..."
if PGPASSWORD=pdfflow psql -h 127.0.0.1 -U pdfflow -d pdfflow -c '\dt' >/dev/null 2>&1; then
  echo "    OK — password auth works."
else
  echo "    WARN — TCP login still failed. Check pg_hba.conf manually."
fi

echo ""
echo "Done."
echo "  DATABASE_URL=postgresql://pdfflow:pdfflow@127.0.0.1:5432/pdfflow"
echo ""
echo "Verify:"
echo "  PGPASSWORD=pdfflow psql -h 127.0.0.1 -U pdfflow -d pdfflow -c \"SELECT email, paid FROM users;\""
echo "  npm run dev  → sign in with Google again"
