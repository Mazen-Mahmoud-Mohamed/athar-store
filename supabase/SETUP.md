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
8. `supabase/migrations/20261004000008_xpay_payments.sql` (XPay Test Mode payments table + RPCs)

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

## XPay Test Mode (Hosted Checkout)

Architecture:

```
Storefront → Edge Function (xpay-create-payment) → XPay Test API
XPay webhook → Edge Function (xpay-webhook) → payments + order status
Storefront return → Edge Function (xpay-payment-status) → verified state
```

### 1. Apply migration `008`

Run `20261004000008_xpay_payments.sql` in the athar SQL Editor (or `supabase db push`).

### 2. Deploy Edge Functions

```bash
supabase functions deploy xpay-create-payment --project-ref rotcgsayspiphcisepmu
supabase functions deploy xpay-payment-status --project-ref rotcgsayspiphcisepmu
supabase functions deploy xpay-webhook --project-ref rotcgsayspiphcisepmu
```

### 3. Set Edge Function secrets (never in Vite / GitHub)

```bash
supabase secrets set \
  XPAY_SECRET_KEY=sk_test_YOUR_TEST_SECRET \
  XPAY_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET \
  STOREFRONT_URL=https://athar.qd.je \
  --project-ref rotcgsayspiphcisepmu
```

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically by Supabase for Edge Functions.

Rules:

- Only `sk_test_...` is accepted by these functions (live keys are rejected).
- Never put `sk_*`, `whsec_*`, or `service_role` in `VITE_*` env files.
- Hosted Checkout does not require a publishable key in the browser.

### 4. Register XPay Test webhook

In [app.xpay.app](https://app.xpay.app) (Test mode):

1. Developers → Webhooks → Add endpoint
2. URL:
   `https://rotcgsayspiphcisepmu.supabase.co/functions/v1/xpay-webhook`
3. Events (minimum):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired` (if available)
4. Copy `whsec_...` into `XPAY_WEBHOOK_SECRET`

### 5. Test cards (XPay docs)

- Success: `5123 4500 0000 0008`, expiry `01/39`, CVV `100`
- Declined: same card with expiry `05/39`

Payment success is confirmed only via verified webhook / server-side session retrieve — never from the browser redirect alone.
