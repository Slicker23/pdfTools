# Stripe payments setup for PdfFlow

PdfFlow uses **Stripe Checkout** for a one-time **€1 lifetime unlock**. No subscriptions.

## 1. Create a Stripe account

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Complete account setup (use **Test mode** while developing — toggle in the top-right)

## 2. Get API keys

1. Open **Developers → API keys**
2. Copy:
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

Add to `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Restart the dev server after editing `.env.local`.

## 3. Webhook (production + optional local)

Stripe notifies your app when payment succeeds via a webhook.

### Local development (Stripe CLI)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# Fedora
sudo dnf install stripe-cli
# or: https://stripe.com/docs/stripe-cli#install
```

Login and forward events:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the **webhook signing secret** (`whsec_...`) into `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Keep `stripe listen` running in a separate terminal while testing payments.

### Production

1. **Developers → Webhooks → Add endpoint**
2. URL: `https://yourdomain.com/api/stripe/webhook`
3. Events: `checkout.session.completed`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET` on your server

## 4. Test the flow

1. Start the app: `npm run dev`
2. Sign in with Google
3. Go to **Pricing** → **€1 Lifetime**
4. Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry, any CVC, any postal code
5. After payment you return to the **Dashboard** with “Payment successful”
6. Account status should show **Lifetime access**

### Without webhook (local shortcut)

If you skip `stripe listen`, payment still works: the dashboard calls `/api/stripe/verify` after redirect and unlocks your account directly.

## 5. Go live

1. Switch Stripe dashboard to **Live mode**
2. Replace test keys with live keys in production env
3. Create a live webhook endpoint
4. Set `NEXT_PUBLIC_APP_URL` to your production URL

## Troubleshooting

| Issue | Fix |
|-------|-----|
| “STRIPE_SECRET_KEY is not configured” | Add keys to `.env.local` and restart `npm run dev` |
| Checkout works but account stays “Free” | Run `stripe listen` or rely on verify redirect; check server logs |
| “You already have lifetime access” | User is already marked `paid` in the database |
| Webhook 400 Invalid signature | Wrong `STRIPE_WEBHOOK_SECRET` — use the secret from `stripe listen` for local |

## Database

Successful payments are stored in the `payments` table and set `users.paid = true`.

```bash
npm run db:studio
```

View `users` and `payments` tables to confirm.
