# أثر Supabase setup (Phase 2)

Dedicated project:

- Name: **athar** / أثر
- Ref: `rotcgsayspiphcisepmu`
- URL host: `rotcgsayspiphcisepmu.supabase.co`

## Frontend env

Vite loads:

1. `.env`
2. `.env.local` (preferred for local secrets; gitignored)

Required keys only:

```env
VITE_SUPABASE_URL=https://rotcgsayspiphcisepmu.supabase.co
VITE_SUPABASE_ANON_KEY=<athar anon / publishable key>
```

Never put `service_role`, `sb_secret_*`, or account passwords in Vite env.

`.env.example` must stay placeholders only.

## Apply migrations (manual — required once)

The local Supabase CLI session may not have Management API privileges on athar.
Apply SQL in the athar Dashboard SQL Editor as role `postgres`, in order:

1. `supabase/migrations/20261003000001_initial_schema.sql`
2. `supabase/migrations/20261003000002_rls.sql`
3. `supabase/migrations/20261003000003_storage.sql`
4. `supabase/migrations/20261003000004_guest_order_confirmation.sql` (guest checkout confirmation payload)
5. `supabase/migrations/20261003000005_admin_order_status_workflow.sql` (server-side order status transitions)
6. `supabase/migrations/20261003000006_deactivate_empty_totes_category.sql` (hide empty توت category; any-product check)
7. `supabase/migrations/20261003000007_deactivate_empty_active_categories.sql` (hide توت when zero *active* products)
8. `supabase/migrations/20261004000008_xpay_payments.sql` (XPay payments table + RPCs)
9. `supabase/migrations/20261004000009_xpay_service_role_rpc_grants.sql`
10. `supabase/migrations/20261004000010_xpay_service_role_table_grants.sql`
11. `supabase/migrations/20261004000011_xpay_service_role_order_read_grants.sql`

Or, after logging the CLI into the account that owns athar:

```bash
supabase link --project-ref rotcgsayspiphcisepmu
supabase db push
```

Optional demo seed only:

- `supabase/seed.sql`

## Promote first admin

1. Create a user in athar **Authentication → Users** (email/password).
2. Run in SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';
```

Do not store that password in the repo.

## XPay Hosted Checkout (Test or Live)

Architecture:

```
Storefront → Edge Function (xpay-create-payment) → XPay API
XPay webhook → Edge Function (xpay-webhook) → payments + order status
Storefront return → Edge Function (xpay-payment-status) → verified state
```

`XPAY_MODE` is server-only (`test` or `live`). Missing or invalid values fail closed. The browser cannot override it. Checkout copy is display-only from a GET to `xpay-payment-status`.

Redirects use `STOREFRONT_URL` (default `https://athar.qd.je`). CORS allows that origin plus local Vite/preview on ports 5173 and 4173 only.

### 1. Apply migrations `008`–`011`

See the list above, or `supabase db push` after linking.

### 2. Deploy Edge Functions

Set `XPAY_MODE=test` **before** deploying this code, or checkout will fail closed until the secret exists.

```bash
supabase functions deploy xpay-create-payment --project-ref rotcgsayspiphcisepmu
supabase functions deploy xpay-payment-status --project-ref rotcgsayspiphcisepmu
supabase functions deploy xpay-webhook --project-ref rotcgsayspiphcisepmu
```

### 3. Set Edge Function secrets (never in Vite / GitHub)

Test (current):

```bash
supabase secrets set \
  XPAY_MODE=test \
  XPAY_SECRET_KEY=sk_test_YOUR_TEST_SECRET \
  XPAY_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET \
  STOREFRONT_URL=https://athar.qd.je \
  --project-ref rotcgsayspiphcisepmu
```

Live (only after a deliberate cutover — do not mix prefixes):

- `XPAY_MODE=live`
- `XPAY_SECRET_KEY` must be `sk_live_...`
- `XPAY_WEBHOOK_SECRET` must be the Live Dashboard `whsec_...` (Test and Live secrets are not interchangeable)
- Optional cutover only: `XPAY_WEBHOOK_SECRET_SECONDARY` = the other environment’s `whsec_...` so both signatures verify until you remove it
- Unsigned webhook bodies are always rejected

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically by Supabase for Edge Functions.

Rules:

- Mode, key prefix, and session `livemode` / `cs_test_` vs `cs_live_` must agree.
- Never put `sk_*`, `whsec_*`, or `service_role` in `VITE_*` env files.
- Hosted Checkout does not require a publishable key in the browser.
- Local `127.0.0.1:5173` uses the **same** remote functions. Do not point it at Live secrets.

### 4. Register XPay webhook

In [app.xpay.app](https://app.xpay.app) (matching Test or Live mode):

1. Developers → Webhooks → Add endpoint
2. URL:
   `https://rotcgsayspiphcisepmu.supabase.co/functions/v1/xpay-webhook`
3. Events (minimum):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired` (if available)
4. Copy that mode’s `whsec_...` into `XPAY_WEBHOOK_SECRET`

Limitation: one Edge Function has one primary signing secret (plus optional secondary). Test and Live Dashboards cannot share a secret. During cutover, set `XPAY_WEBHOOK_SECRET_SECONDARY` explicitly; do not leave both secrets set longer than needed.

### 5. Test cards (XPay Test Mode docs)

- Success: `5123 4500 0000 0008`, expiry `01/39`, CVV `100`
- Declined: same card with expiry `05/39`

Payment success is confirmed only via verified webhook / server-side session retrieve — never from the browser redirect alone.
