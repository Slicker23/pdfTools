# PdfFlow — Complete deployment plan

**Domain:** `free-pdf-flow.com` (already purchased)  
**Stack:** Docker Compose (web + worker + postgres + redis + ollama)  
**Target cost:** $0/month (Oracle Always Free VM + Cloudflare)

---

## Architecture

```
                    free-pdf-flow.com
                           │
                    Cloudflare (DNS + proxy + SSL)
                           │
              Oracle VM (Always Free, ARM)
                           │
         ┌─────────────────┴─────────────────┐
         │         Caddy :443 → :3000        │
         └─────────────────┬─────────────────┘
                           │
              docker compose (pdfflow)
         ┌──────────┬──────────┬──────────┐
         │   web    │  worker  │  ollama  │
         │ Next.js  │ LibreOCR │   AI     │
         └────┬─────┴────┬─────┴──────────┘
              │          │
         postgres      redis
         (users,       (job
          payments)     queue)
```

| Service | Port (public) | Required for |
|---------|---------------|--------------|
| web | 443 via Caddy | UI, API, Stripe, auth |
| worker | internal | PDF→Word, OCR, batch, server jobs |
| postgres | internal | Users, payments, jobs |
| redis | internal | Job queue |
| ollama | internal | Chat PDF, AI tools |

**Do not expose** postgres, redis, or ollama to the internet.

---

## Phase 0 — Prerequisites (you)

- [x] Domain: `free-pdf-flow.com`
- [ ] Oracle Cloud account ([cloud.oracle.com/free](https://www.oracle.com/cloud/free/))
- [ ] Cloudflare account ([cloudflare.com](https://cloudflare.com)) — free
- [ ] Google OAuth client ([docs/GOOGLE_AUTH.md](./GOOGLE_AUTH.md))
- [ ] Stripe account ([docs/STRIPE.md](./STRIPE.md))
- [ ] Git repo pushed (GitHub/GitLab) so the VM can clone

**Local Docker already working?** Run `npm run docker:up` and confirm [http://localhost:3000](http://localhost:3000).

---

## Phase 1 — Oracle Cloud VM (free server)

### 1.1 Create the VM

1. Oracle Cloud Console → **Compute → Instances → Create instance**
2. **Name:** `pdfflow-prod`
3. **Image:** Ubuntu 24.04 (aarch64) or Oracle Linux 9
4. **Shape:** Ampere **VM.Standard.A1.Flex**
   - OCPUs: **2–4** (max 4 on free tier)
   - RAM: **12–24 GB** (use 12 GB + `OLLAMA_MODEL=llama3.2:1b`, or 24 GB + `llama3.2`)
5. **Boot volume:** 50–100 GB
6. **Networking:** assign public IPv4
7. **SSH key:** add your public key (`~/.ssh/id_ed25519.pub`)

> If capacity is unavailable, retry another availability domain or off-peak hours.

### 1.2 Open firewall (Oracle + OS)

**Oracle Security List / NSG:** allow inbound **22, 80, 443** from `0.0.0.0/0`.

**On the VM:**

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 22 -j ACCEPT
# Persist if using iptables-persistent, or rely on Oracle NSG only
```

### 1.3 Install Docker

```bash
ssh ubuntu@YOUR_VM_IP

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in

sudo apt-get update && sudo apt-get install -y git docker-compose-plugin
docker --version
docker compose version
```

Note your **public IP** — you need it for DNS.

---

## Phase 2 — DNS (free-pdf-flow.com)

### Option A — Cloudflare (recommended)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Add site** → `free-pdf-flow.com`
2. Copy the two **nameservers** Cloudflare gives you
3. At your **domain registrar**, replace nameservers with Cloudflare’s
4. Wait for activation (minutes to 24h)
5. Cloudflare → **DNS → Records:**

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `YOUR_VM_IP` | Proxied (orange) |
| A | `www` | `YOUR_VM_IP` | Proxied |

6. **SSL/TLS → Overview:** set **Full (strict)** after Caddy is running on the VM

Verify:

```bash
dig free-pdf-flow.com +short
```

### Option B — Registrar DNS only

Add the same **A records** at your registrar. You still need **Caddy** on the VM for HTTPS (Let’s Encrypt).

---

## Phase 3 — Clone app on the VM

```bash
ssh ubuntu@YOUR_VM_IP

git clone https://github.com/YOUR_USER/pdfTools.git
cd pdfTools

cp .env.docker.example .env.docker
nano .env.docker   # fill in Phase 4 values
```

---

## Phase 4 — Production `.env.docker`

**Critical rules:**

- Each variable appears **once** (duplicate `STRIPE_SECRET_KEY=` lines overwrite with empty!)
- `NEXT_PUBLIC_APP_URL` is **build-time** → changing it requires rebuild
- `DATABASE_URL` password must match `POSTGRES_PASSWORD`

```env
# --- Infrastructure (Docker internal hostnames — do not change) ---
DATABASE_URL=postgresql://pdfflow:STRONG_PASSWORD_HERE@postgres:5432/pdfflow
REDIS_URL=redis://redis:6379
POSTGRES_USER=pdfflow
POSTGRES_PASSWORD=STRONG_PASSWORD_HERE
POSTGRES_DB=pdfflow

# --- AI ---
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2:1b
# Use llama3.2 only if VM has 16GB+ RAM

# --- Jobs ---
LOCAL_STORAGE_PATH=/data/jobs
LIBREOFFICE_PATH=soffice

# --- Auth ---
AUTH_SECRET=                    # openssl rand -base64 32
AUTH_URL=https://free-pdf-flow.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAILS=you@example.com

# --- Stripe (test first, live when ready) ---
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# --- Public (REBUILD required if changed) ---
NEXT_PUBLIC_APP_URL=https://free-pdf-flow.com
NEXT_PUBLIC_YJS_WS_URL=ws://localhost:1234
```

Generate secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
```

---

## Phase 5 — Google OAuth (production)

Google Cloud Console → **APIs & Services → Credentials** → OAuth client:

**Authorized JavaScript origins:**

```
https://free-pdf-flow.com
```

**Authorized redirect URIs:**

```
https://free-pdf-flow.com/api/auth/callback/google
```

Keep `http://localhost:3000/...` for local dev.

See [GOOGLE_AUTH.md](./GOOGLE_AUTH.md).

---

## Phase 6 — Build and start Docker

On the VM, from repo root:

```bash
npm run docker:up
# equivalent: docker compose --env-file .env.docker up -d --build
```

First run: **10–20+ minutes** (image build + Ollama model download).

Monitor:

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f web
docker compose --env-file .env.docker logs -f worker
docker compose --env-file .env.docker logs ollama-init
```

Confirm web responds locally:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000
# expect 200 or 307
```

---

## Phase 7 — HTTPS (Caddy)

Install Caddy on the VM (not in Docker — terminates TLS, proxies to web):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```caddy
free-pdf-flow.com, www.free-pdf-flow.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Open [https://free-pdf-flow.com](https://free-pdf-flow.com).

**Cloudflare:** SSL/TLS mode **Full (strict)**.

Alternative: copy [deploy/Caddyfile](../deploy/Caddyfile) from this repo.

---

## Phase 8 — Stripe (production)

### Test mode first (on live domain)

1. Stripe Dashboard → **Test mode**
2. Keys in `.env.docker`: `sk_test_...`
3. Pay with `4242 4242 4242 4242` on `https://free-pdf-flow.com/pricing`

### Webhook (required for reliable unlock)

**Developers → Webhooks → Add endpoint**

| Field | Value |
|-------|-------|
| URL | `https://free-pdf-flow.com/api/stripe/webhook` |
| Events | `checkout.session.completed` |

Copy `whsec_...` → `.env.docker` → restart web:

```bash
docker compose --env-file .env.docker up -d web
```

### Go live

1. Stripe → **Live mode** → activate account
2. Replace with `sk_live_...` and live `whsec_...`
3. Create **live** webhook (same URL)
4. One real €1 payment test

See [STRIPE.md](./STRIPE.md).

---

## Phase 9 — Production smoke test

| # | Test | Pass? |
|---|------|-------|
| 1 | `https://free-pdf-flow.com` loads | |
| 2 | Google sign-in works | |
| 3 | Merge PDF (browser, free tier) | |
| 4 | PDF → Word (server job, paid) | |
| 5 | Chat PDF (Ollama — wait for model) | |
| 6 | Stripe €1 checkout → Lifetime access | |
| 7 | Stripe webhook delivery **200** | |
| 8 | DB: `users.paid = true` | |

**DB check:**

```bash
docker compose --env-file .env.docker exec postgres \
  psql -U pdfflow -d pdfflow -c "SELECT email, paid FROM users;"
```

---

## Phase 10 — Operations

### Updates (new code)

```bash
cd pdfTools
git pull
npm run docker:up
```

If only runtime env changed (Stripe, secrets):

```bash
docker compose --env-file .env.docker up -d web worker
```

### Logs

```bash
npm run docker:logs
docker compose --env-file .env.docker logs -f worker
```

### Backups (Postgres)

```bash
docker compose --env-file .env.docker exec postgres \
  pg_dump -U pdfflow pdfflow > backup-$(date +%F).sql
```

Schedule weekly with `cron`.

### Restart after reboot

Docker `restart: unless-stopped` handles containers. Caddy:

```bash
sudo systemctl enable caddy
```

---

## Resource guide (Oracle free tier)

| VM RAM | Recommended `OLLAMA_MODEL` |
|--------|----------------------------|
| 6–8 GB | `llama3.2:1b` |
| 12 GB | `llama3.2:1b` or `llama3.2` |
| 24 GB | `llama3.2` |

| Symptom | Fix |
|---------|-----|
| OOM / worker crashes | Lower `OLLAMA_MODEL`, reduce worker concurrency |
| Disk full | `docker system prune`, check `jobs` volume |
| AI slow | Normal on free ARM; use `llama3.2:1b` |

---

## Optional — Collaboration (Yjs)

```bash
docker compose --env-file .env.docker --profile collab up -d
```

Set `NEXT_PUBLIC_YJS_WS_URL=wss://free-pdf-flow.com` (needs Caddy route for `:1234` or separate subdomain). Skip for initial launch.

---

## Optional — Cloudflare R2 (job storage)

If local disk fills up, configure S3-compatible R2 in `.env.docker`:

```env
S3_BUCKET=pdfflow-jobs
S3_ENDPOINT=https://....r2.cloudfloudflare.com
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

Free tier available. Not required for launch.

---

## Checklist summary

```
□ Oracle VM running (2–4 OCPU, 12–24 GB RAM)
□ Docker + compose installed
□ DNS: free-pdf-flow.com → VM IP (Cloudflare)
□ .env.docker filled (no duplicate keys!)
□ NEXT_PUBLIC_APP_URL=https://free-pdf-flow.com
□ npm run docker:up (build succeeds)
□ Caddy HTTPS working
□ Google OAuth prod redirect URI
□ Stripe webhook → 200
□ All smoke tests pass
```

---

## If Oracle free tier is unavailable

| Fallback | Cost |
|----------|------|
| Home PC + Cloudflare Tunnel | $0 (dynamic IP OK) |
| Hetzner CX22 | ~€4/mo (same Docker steps) |
| Split: Vercel + Neon + Upstash | $0 but **no worker/Ollama** — not full app |

---

## Related docs

- [STRIPE.md](./STRIPE.md) — payments
- [GOOGLE_AUTH.md](./GOOGLE_AUTH.md) — sign-in
- [README.md](../README.md) — local Docker usage
