# Order cancellation and XPay fulfillment fix

Local implementation only. No deployment, production migration, commit, push,
secret changes, or real payment requests were performed.

## Verified root causes and existing protections

- Migration 005's `admin_update_order_status` already authenticates admins,
  locks the order and enforces sequential status transitions. It does not restore
  inventory or check payment status. Its trigger permits valid direct updates;
  its comment claiming all direct status updates are blocked is inaccurate.
- Migration 002 grants admins direct order UPDATE through RLS, including financial
  columns. A check in the UI or admin RPC alone could therefore be bypassed.
- Migration 008's guest checkout reserves inventory. Its XPay cancellation RPC
  restores inventory only for pending orders and tracks release on a payment row.
  Cancelling through the admin RPC first leaves stock deducted, and the webhook
  then skips restoration because the order is already cancelled. COD has no
  payment row and no restoration path.
- Existing payment RPCs lock payment then order, while admin/setup compensation
  locks order first. Adding payment writes to admin cancellation without changing
  this order would introduce deadlock risk.
- XPay paid verification already validates signatures, mode, session ownership,
  amount, currency and acceptable payment/order states. These checks remain.
  Provider cancellations may be revived after re-reserving stock; insufficient
  stock raises an error. Duplicate events and paid RPC calls are already handled.
- Polling's requires-action update and webhook refund updates previously wrote
  payment and order separately. A stale poll could overwrite successful status.
  These state writers must participate in the same locking protocol for the two
  requested fixes to remain reliable.

## Implementation and policies

Migration `20261020000012_order_inventory_and_payment_guards.sql` is additive;
old migrations remain unchanged. It runs in a transaction.

- `orders.stock_released` is the authoritative reservation flag for both COD and
  XPay. `cancellation_source` distinguishes admin, payment and legacy cancellation.
  Existing payment release markers remain synchronized for compatibility.
- All affected RPCs lock the order before payment writes. Stock updates, release
  flags and status changes commit together. Product updates use ordered IDs and
  aggregate quantities. Repeated cancellation cannot release stock twice.
- Admin cancellation of pending, confirmed or preparing orders restores stock.
  Shipped cancellation remains allowed but does not restore stock: physical
  returns need a separate process. Delivered orders remain terminal.
- Explicit admin cancellation wins against expiry or paid callbacks in either
  transaction order. A late verified payment is recorded as successful, but the
  order stays cancelled and inventory stays released. Cancellation does not
  initiate a financial refund; the admin page displays a follow-up notice.
- A payment-driven cancellation may still be revived by verified payment, but
  only after an atomic stock reservation. Insufficient/deleted stock fails closed
  and rolls back the entire transaction, requiring reconciliation and retry.
- Every forward XPay transition requires `payment_status = successful`. COD
  continues through the workflow with pending payment status. Fully or partially
  refunded XPay orders are not automatically eligible for further fulfillment.
- Browser direct order updates are revoked. Service-role order state writes and
  payment financial/stock writes also go through RPCs; provider references,
  metadata and idempotency keys retain column-level update permission.
- Polling and refund synchronization use a service-only RPC with the same order
  lock. Stale requires-action responses cannot overwrite successful/cancelled
  state, and partial refund events cannot downgrade an already full refund.
- Internal helpers are not executable by anon, authenticated or service roles.
  Admin RPC authorization remains explicit; XPay state RPCs remain service-only.
  UI action filtering and Arabic error messages supplement the database boundary.
- Final integration review found the storefront inferred fulfillment from payment
  success and discarded the returned order status. The payment service now validates
  and preserves that status, including in saved confirmations. A paid-cancelled order
  displays cancellation and payment/refund follow-up instead of promising delivery,
  including after refresh and pending-payment token cleanup.

## Historical compatibility and remaining risks

The migration never changes product stock, existing order status or payment status.
For already cancelled orders it imports known payment release markers; unknown
cancellations are marked legacy. Repeated cancellation never attempts a historical
stock correction. Historical cancellations without reliable release evidence stay
cancelled if payment arrives, requiring manual review. Known provider cancellations
retain their verified-payment revival path. Existing successful payments remain
idempotent and fulfillable; COD defaults remain unchanged.

Existing bad data (e.g. unpaid XPay orders already confirmed, manual stock edits,
or inconsistent payment attempts) is not silently repaired. Such orders require
review; the new guard blocks further unpaid fulfillment. Signature/amount/mode
verification still happens in the edge handlers; service-role RPC execution is a
trusted-server boundary, not a replacement for provider verification.

Database tests run PostgreSQL 18.4 locally with a minimal Supabase auth harness,
not the hosted Supabase platform. The repository's Supabase config specifies
PostgreSQL 17; the remote version has not been inspected. A rehearsal on the actual
target major version is still required. Storage/catalog-only migrations are omitted.
Actual edge handlers run under a test Deno shim with local SQL transport and mocked
provider GET responses. Hosted runtime, PostgREST and visual browser QA are not
covered. No provider network requests are made.

## Regression tests

`npm run test:orders` starts a disposable PostgreSQL server on a random loopback
port, loads the real relevant migrations, reproduces both original bugs, applies
the new migration and runs 26 regression groups. It reads no environment files or
remote database URLs, and removes its temporary database on exit. Node 24 is used
for TypeScript imports; dependencies are pinned development-only packages.

Coverage includes authorization and direct-write bypasses; duplicate and concurrent
COD/XPay cancellation; confirmed/preparing/shipped/delivered behavior; all unpaid
statuses at every forward step; historical and already-paid orders; both orderings
of admin/expiry, admin/paid, paid/expiry and poll/paid races; setup compensation;
late-created and multiple payment attempts; deleted products; insufficient-stock
rollback; refund synchronization; UI filtering; actual signed webhook retries;
poll/refund handler RPC integration; signature, mode, ownership, amount and guest
token rejection. Race tests assert that PostgreSQL actually reports a blocked lock
before releasing the first transaction. Storefront tests execute the actual service
mapping and session-storage functions and render the actual React success page for
paid cancellation, unpaid cancellation, normal paid fulfillment and COD.

Other validation: `npm run test:xpay`, `node node_modules/typescript/bin/tsc -b`,
and `npm run lint`. Lint has ten pre-existing warnings and no new warnings.
Full Vite build is intentionally not run because its sitemap hook rewrites the
user's already-modified sitemap and can make external requests.

Final local validation on 2026-10-21: all 26 order regression groups PASS;
existing XPay suite PASS; TypeScript PASS; lint PASS with the same ten existing
warnings; `git diff --check` PASS. The previously blocked timestamp-preservation
assertion now passes. Expected invalid-signature/amount/ownership logs are negative
test cases, not failures. No dependency reinstall was needed when resuming.

## Exact scoped file manifest

Existing files modified by this work:

- `package.json`
- `package-lock.json`
- `src/lib/orderStatus.ts`
- `src/pages/admin/AdminOrderDetailsPage.tsx`
- `src/pages/OrderSuccessPage.tsx`
- `src/services/orderService.ts`
- `src/services/paymentService.ts`
- `supabase/functions/xpay-payment-status/index.ts`
- `supabase/functions/xpay-webhook/index.ts`

New files:

- `supabase/migrations/20261020000012_order_inventory_and_payment_guards.sql`
- `scripts/test-order-workflow.mjs`
- `scripts/order-handler-test-harness.mjs`
- `scripts/order-storefront-test-harness.mjs`
- `docs/order-workflow-fix.md`

Reviewed but preserved as pre-existing modifications: `public/sitemap.xml`,
`scripts/_qa-xpay-signature.mjs`, `supabase/functions/_shared/xpay.ts`.
Other pre-existing untracked assets/audit scripts were preserved.

## Production approval boundary

Production remains untouched. Before any rollout, obtain explicit approval for
the migration, both changed edge handlers, and the admin UI, after reviewing the
policies above (especially shipped inventory and late paid cancellations).

The changes are ready for staging/release review, not an unconditional production
go-ahead. The following procedure is for a separately approved rollout only:

1. Prepare an explicit release manifest and immutable artifacts from the approved
   baseline plus the scoped files. Do not publish the dirty working tree wholesale.
   `public/sitemap.xml`, `scripts/_qa-xpay-signature.mjs`, and
   `supabase/functions/_shared/xpay.ts` were already modified before this work.
   Review the shared helper version included in each edge bundle explicitly; do
   not silently publish or discard those pre-existing changes. Keep all existing
   XPay mode, signing secrets and function JWT settings unchanged.
2. Rehearse the exact migration and bundles on an isolated Supabase environment
   matching the target PostgreSQL major version. Exercise real PostgREST with
   admin/customer/anon/service roles and synthetic data, mocked provider responses
   and no XPay session creation. Verify all direct financial writes are denied,
   RPC grants and schema discovery work, successful COD/XPay flows remain intact,
   and paid-cancelled customer copy survives refresh. Measure migration duration.
3. Under separately approved access, verify the exact project identity, migration
   ledger (001–011 present, 012 absent), current owners/grants including column-level
   or inherited grants, and the enabled timestamp/status triggers. Review existing
   unpaid advanced orders, mismatched payment rows and ambiguous cancellations.
   Confirm a recoverable backup/PITR point and record pre-migration stock/status
   counts. Stop on unexpected drift; do not silently repair historical data.
4. Establish a server-side maintenance gate covering direct guest-order RPCs,
   checkout creation, admin mutations, status polling and webhook processing.
   A maintenance page alone does not block open tabs or direct API calls. Drain
   in-flight requests/transactions, including old payment RPC invocations. Existing
   hosted payment sessions may still settle: confirm durable webhook retention or
   provider redelivery/replay before pausing consumers. Do not acknowledge events
   as successfully processed while dropping them. If a reliable gate and replay
   path are unavailable, stop and design a staged compatibility rollout first.
5. As the owning migration role, apply ONLY migration 012 through the approved
   migration mechanism, preserving its BEGIN/COMMIT transaction and migration
   ledger. Use a bounded session lock timeout (e.g. 5 seconds) and a statement
   timeout based on the rehearsal (e.g. 2 minutes for a small database). The table
   ALTER takes an exclusive orders lock through the backfill. On any failure, roll
   back the entire transaction, keep maintenance active and inspect the cause.
   Do not manually rerun fragments or mark a failed migration as applied.
6. While writers remain paused, deploy `xpay-payment-status` and `xpay-webhook`
   with the reviewed shared dependencies and existing JWT settings. Deploy the
   reviewed frontend, including the customer status fix. No redeploy of
   `xpay-create-payment` is required by this change. Refresh the PostgREST schema
   cache (`NOTIFY pgrst, 'reload schema';`) after commit, and verify the new RPC
   and altered order type are visible. New handlers need the new RPC; old handlers
   lose financial table-write privileges, so an unpaused mixed-version rollout
   is not safe.
7. With the maintenance gate still active, use read-only checks to verify migration
   tracking, function definitions/owners, grants, enabled triggers, release hashes,
   unchanged stock/status counts and unchanged secrets/mode. Run mutation smoke
   checks only in staging, unless a separate production-test plan is approved.
   Re-enable updated webhook processing, replay retained events through existing
   verification/deduplication, then restore polling, checkout and admin access.
   Watch permission/RPC errors, webhook failures, stock failures and paid-cancelled
   orders requiring refund review. Event replay must not create new payments.
8. If validation fails, keep traffic gated and prefer a forward correction. Do
   not revert only the handlers or only the database: privileges and shared stock
   markers must stay compatible. Do not drop markers or reverse inventory blindly.

No step above was performed against production, and this document grants no
permission to do so. Staging/production access, provider event replay, deployment,
and any data repair require their own explicit approval.
