# PdfFlow — Private PDF Platform

EU multi-language PDF editor and manager. Browser-first processing, Google auth, €1 lifetime unlock.

## Features

### Tier 1 — Browser-based (free tier: 3 docs)
- Merge, split, extract, rotate, reorder PDFs
- Compress PDF
- PDF ↔ JPG/PNG
- Basic annotation (highlight, underline, strikethrough, comments)
- Watermark, flatten, page numbers, metadata removal, password protect
- Extract images, compare PDFs

### Tier 2 — Pro tools (€1 lifetime)
- PDF ↔ Word/Excel/PPT (server conversion)
- OCR (browser Tesseract.js + optional server)
- Form creation/filling
- Digital signature (draw/upload)
- Batch processing

### Tier 3 — Advanced (revenue-gated)
- Cloud integrations (Google Drive, Dropbox)
- Real-time collaboration (Yjs)
- Smart redaction (PII detection)

### Tier 4 — AI
- Chat with PDF
- AI template generation
- 20 AI credits/month included

## Stack

- **Frontend:** Next.js 16, Tailwind CSS, next-intl (8 EU languages)
- **Auth:** Auth.js + Google OAuth
- **Database:** PostgreSQL + Drizzle ORM
- **Payments:** Stripe (€1 one-time)
- **PDF:** pdf-lib, PDF.js, Tesseract.js, **[pdfflow-engine](./packages/pdfflow-engine/README.md)** (from-scratch text extract/edit)
- **AI:** Ollama (free, local — no API key)
- **Server jobs:** S3/R2 temp storage, BullMQ worker (Phase 4+)

## Run everything with Docker (recommended)

The whole stack — web app, background worker, PostgreSQL, Redis, and Ollama — runs
from a single command. No local Postgres/Redis/LibreOffice/OCR install needed.

```bash
cp .env.docker.example .env.docker   # then fill in AUTH_SECRET and any OAuth/Stripe keys
npm run docker:up                    # docker compose --env-file .env.docker up -d --build
```

Open [http://localhost:3000](http://localhost:3000).

What this starts:

| Service | Purpose | Port |
|---------|---------|------|
| `web` | Next.js app (`next start`) | 3000 |
| `worker` | BullMQ worker (LibreOffice, OCR, PDF engine) | — |
| `postgres` | Database (schema auto-applied by a one-shot `migrate` step) | 5432 |
| `redis` | Job queue | 6379 |
| `ollama` | Local AI (model auto-pulled on first start) | 11434 |

First-run notes:

- The `ollama-init` step downloads the model in `OLLAMA_MODEL` (default `llama3.2`, ~2GB).
  AI tools degrade gracefully until it finishes. Use `OLLAMA_MODEL=llama3.2:1b` on low-RAM machines.
- `AUTH_SECRET` is required for sign-in — generate one with `openssl rand -base64 32`.
- Uploaded/temp job files are shared between `web` and `worker` via the `jobs` volume.

Common commands:

```bash
npm run docker:logs    # follow logs
npm run docker:down    # stop the stack (volumes persist)
docker compose --profile collab up -d   # also start the Yjs collaboration server (:1234)
```

Data persists in named volumes (`pgdata`, `redis`, `ollama`, `jobs`). To wipe everything:
`docker compose --env-file .env.docker down -v`.

## Setup (without Docker)

```bash
cp .env.example .env.local
npm install
```

### Database (no Docker)

**Option A — Neon (recommended, free, no local install)**

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string into `.env.local`:

```
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/pdfflow?sslmode=require
```

3. Push schema:

```bash
npm run db:push
```

**Option B — Local PostgreSQL (Fedora/RHEL)**

Postgres is installed but the data directory must be initialized once:

```bash
sudo ./scripts/setup-postgres-fedora.sh
npm run db:push
```

Or manually:

```bash
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE USER pdfflow WITH PASSWORD 'pdfflow';"
sudo -u postgres psql -c "CREATE DATABASE pdfflow OWNER pdfflow;"
npm run db:push
```

If `db:push` hangs with no output, Postgres is not running — check with `systemctl status postgresql`.

Fill in Google OAuth — see [docs/GOOGLE_AUTH.md](docs/GOOGLE_AUTH.md). Also set `AUTH_SECRET` and `AUTH_URL`.

Fill in Stripe — see [docs/STRIPE.md](docs/STRIPE.md) for €1 lifetime checkout setup.

**Note:** `drizzle-kit` loads `.env.local` automatically. Error `connection "url" ... required` = missing `DATABASE_URL`. Connection timeout = Postgres not running or wrong URL.

Open [http://localhost:3000](http://localhost:3000)

### AI tools (free — Ollama, no API key)

Chat with PDF and AI Templates use [Ollama](https://ollama.com) running locally. No OpenAI or paid API needed.

```bash
./scripts/setup-ollama-fedora.sh
```

Or manually:

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull llama3.2
```

Optional `.env.local` overrides (defaults work on the same machine):

```
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

Smaller/faster model on low-RAM machines: `OLLAMA_MODEL=llama3.2:1b`

## Environment Variables

See [.env.example](.env.example) for all required variables.

## Database

```bash
npm run db:generate   # Generate migrations
npm run db:push       # Push schema to database
npm run db:studio     # Open Drizzle Studio
```

## pdfflow-engine (npm package)

The from-scratch PDF text engine in `src/lib/pdf-engine/` is published as **[pdfflow-engine](./packages/pdfflow-engine/README.md)** — usable in any Node.js or bundler project for PDF interpretation and text editing.

```bash
npm run build:engine   # build packages/pdfflow-engine/dist
```

See the [full engine documentation](./packages/pdfflow-engine/README.md) for install, API reference, architecture, and examples.

## Deployment

**Full step-by-step plan:** [docs/DEPLOY.md](docs/DEPLOY.md) — Oracle free VM + Docker + Cloudflare for `free-pdf-flow.com`.

Quick reference:

- **All-in-one (recommended, $0):** Oracle Always Free ARM VM + `npm run docker:up` + Caddy + Cloudflare DNS
- **Database / Redis / Ollama:** run on the same VM via Docker Compose (not separate paid services)
- **Stripe / Google:** production URLs use `https://free-pdf-flow.com` — see [docs/STRIPE.md](docs/STRIPE.md) and [docs/GOOGLE_AUTH.md](docs/GOOGLE_AUTH.md)

## SEO

- Per-tool landing pages in 8 languages
- Structured data (WebApplication, FAQPage, HowTo)
- Sitemap and robots.txt
- Blog with seed articles

## License

Private — all rights reserved.
