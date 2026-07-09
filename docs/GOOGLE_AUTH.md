# Google OAuth setup for PdfFlow

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or pick existing)
3. Go to **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal for Workspace)
   - App name: `PdfFlow`
   - User support email: your email
   - Developer contact: your email
   - Scopes: keep default (`email`, `profile`, `openid`)
   - Add test users if app is in **Testing** mode
4. Go to **APIs & Services → Credentials**
5. **Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `PdfFlow local` (or production name)

### Authorized JavaScript origins

```
http://localhost:3000
```

Add production URL later, e.g. `https://yourdomain.com`.

### Authorized redirect URIs

```
http://localhost:3000/api/auth/callback/google
```

Production:

```
https://yourdomain.com/api/auth/callback/google
```

6. Copy **Client ID** and **Client secret**

## 2. Environment variables

Edit `.env.local`:

```env
AUTH_SECRET=your-random-secret-at-least-32-chars
AUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Restart dev server after changes:

```bash
npm run dev
```

## 3. Test sign-in

1. Open http://localhost:3000/en/auth/signin
2. Click **Sign in with Google**
3. Pick Google account
4. You should land on `/en/dashboard`
5. User row appears in Postgres `users` table

Check DB:

```bash
PGPASSWORD=pdfflow psql -h 127.0.0.1 -U pdfflow -d pdfflow -c "SELECT email, name, paid FROM users;"
```

## Common errors

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Redirect URI in Google Console must match exactly: `http://localhost:3000/api/auth/callback/google` |
| `Configuration` | Missing `AUTH_SECRET` or Google credentials in `.env.local` |
| `AccessDenied` | User not in test users list while app is in Testing mode |
| `OAuthCallback` | Wrong client secret, or DB not running during sign-in |

## Production

Set on Vercel/host:

- `AUTH_URL=https://yourdomain.com`
- `NEXT_PUBLIC_APP_URL=https://yourdomain.com`
- Same Google credentials with production origins/redirects added

OAuth consent screen must be **Published** for public users (not just test users).
