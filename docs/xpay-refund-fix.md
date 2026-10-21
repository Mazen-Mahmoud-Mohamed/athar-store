# XPay refund webhook fix — local validation, 2026-10-21

## Decision

**GO for isolated staging validation, subject to approval before any cloud operation.
NO-GO for production. Nothing has been deployed.**

This report supersedes the unresolved local refund-defect conclusion in
`release-validation-2026-10-21.md`. The earlier report and manifest remain historical
audit snapshots. `refund-release-manifest-2026-10-21.json` records the current
candidate files/hashes, this task's exact delta, and preservation checks.

No production connection, payment/refund creation, secret/mode/configuration change,
commit, push, merge or deployment occurred. All provider requests in tests are
mocked; SQL runs on disposable loopback-only PostgreSQL with synthetic data.

## Exact root cause

The previous handler cast every `data.object` to Checkout Session and used its ID
as `payments.provider_session_id`. Actual refund events carry `re_*` IDs; charge
events carry `ch_*`. Neither identifies the stored `cs_*` checkout. The no-payment
branch acknowledged and deduplicated these events without changing money state.
The refund branch also assumed checkout total fields and defaulted missing amounts
to a full refund. Old refund fixtures supplied Checkout Sessions and missed both
problems. The generic event-ID marker alone could permanently suppress recovery.

Official contracts distinguish:

- `refund.created`: RefundAPI, with amount, currency, status, chargeId and paymentIntentId.
- `refund.failed`: RefundAPI whose status is failed.
- `charge.refunded`: ChargeAPI, with cumulative amountRefunded and individual refunds.
- Checkout completion/expiry events continue to carry Checkout Sessions.

The API reference specifies charge.refunds as an array and uppercase lifecycle
values; the event guide also documents refunds.data and the integration examples
use lowercase statuses. The parser supports these documented variants and rejects
incomplete/paginated charge snapshots rather than guessing a total.

## Implementation

Refund events branch immediately after signature verification, before the checkout
parser and generic dedupe. The new parser validates the signed envelope's mode,
mode-prefixed event/refund/charge/payment-intent identifiers, correct resource type,
integer positive minor-unit amounts, EGP currency and lifecycle status. Charge
snapshots must have captured/paid evidence, a matching captured amount, unique
refund IDs, matching charge/intent ownership and a successful-refund sum equal to
amountRefunded. Charge amount must match the stored payment amount.

Association uses the stored provider_payment_intent_id learned through existing
verified checkout handling. Neither customer metadata nor a refund ID can select
an arbitrary order. Missing, ambiguous, unpaid, cross-mode or inconsistent
associations fail without marking the event applied. A refund arriving before
verified checkout success must retry; the handler does not infer paid status.

Migration 013 adds a refund ledger keyed by provider refund ID and a service-only
apply_xpay_refund_event RPC. It stores one lifecycle/immutable amount and ownership
tuple per refund, so repeated deliveries and different event types cannot count
the same money twice. It preserves succeeded status against stale failed/pending
snapshots, terminal failures against stale pending snapshots, and allows subsequent
success to supersede pending/failure. Pending/requires_action/failed/canceled are
recorded individually but contribute zero to successful returned-money totals.

The RPC follows 012's order-before-payment locking, revalidates the payment/order,
mode, intent ownership, status and amounts, merges the ledger, derives partial/full
payment and order payment_status from the sum of unique successful refunds, and
sets the event's refunds_applied marker in the same transaction. Oversized totals,
identity conflicts or database failures roll back all new ledger/money changes.
Final acknowledgment occurs only after RPC success. Invalid payloads/signatures
return 400; unresolved association/database problems return 500 for retry.

Refunds never change order fulfillment status, cancellation source, stock or stock
release flags. Existing XPay fulfillment guards block further transitions once a
successful refund changes the payment to partial/full refund. Pending/failed refund
attempts leave the verified paid state unchanged. COD behavior is unchanged.

A late valid checkout success for an already partially/fully refunded payment is
acknowledged without undoing the refund. Existing successful checkout flows,
signature checks, mode checks, cancellation and inventory guards remain covered.

## Additive migration 013

`supabase/migrations/20261021000013_xpay_refund_event_ledger.sql` requires 012.
Migration 012 is byte-for-byte preserved.

- `xpay_refunds`: immutable provider refund identity, payment/intent/charge IDs,
  bigint amount in minor units, currency, lifecycle status and update timestamp.
- `xpay_webhook_events.refunds_applied`: default false. Existing event markers are
  deliberately not treated as proof that a refund was financially applied.
- An index supports intent lookup; ambiguity is rejected instead of imposing a
  potentially failing uniqueness constraint on historical data.
- RLS enabled on the ledger. No PUBLIC/anon/authenticated access. service_role
  gets read-only table access and EXECUTE on the atomic RPC; no direct ledger DML.
  The RPC has an empty search_path and schema-qualified application relations.
- Existing partial/full historical refund states never downgrade while an
  incomplete ledger is populated. Incorrect old full-refund statuses therefore
  require reviewed reconciliation; this migration does not silently repair them.
- No stock/order-status/money backfill, destructive SQL or refund API operation.

The ALTER holds an exclusive event-table lock and the index build blocks payment
writes; rehearse duration and apply once with the approved ledger mechanism under
the coordinated writer gate. Existing trigger/owner/default grants must be checked
on actual Supabase staging. The ledger FK preserves refund evidence by preventing
deletion of referenced payments; any future manual order/payment deletion process
must explicitly account for that evidence.

## Exact files changed in this task

1. `supabase/functions/_shared/xpay.ts` — event typing and refund/charge parser;
   preserves the pre-existing upstream diagnostic changes.
2. `supabase/functions/xpay-webhook/index.ts` — event-specific routing, verified
   intent association, atomic refund RPC and late-paid/refunded handling.
3. `supabase/migrations/20261021000013_xpay_refund_event_ledger.sql` — new migration.
4. `scripts/order-handler-test-harness.mjs` — PostgREST-like JSON serialization,
   ambiguous-row errors and per-request SQL connections for concurrency checks.
5. `scripts/test-order-workflow.mjs` — loads 013, corrects the old refund fixture
   and invokes the new regression groups, retaining original coverage.
6. `scripts/test-xpay-refunds.mjs` — new documented-resource fixtures and tests.
7. `scripts/order-storefront-test-harness.mjs` — service/storage/rendering coverage
   for partial/full refund states, including cancelled orders.
8. `docs/xpay-refund-fix.md` — this report and historical recovery procedure.
9. `docs/refund-release-manifest-2026-10-21.json` — updated candidate manifest.

Ignored local validation helpers, excluded from the release, were also added:
`node_modules/.tmp/athar-edge-check.d.ts` (type-check declarations) and
`node_modules/.athar-refund-manifest.mjs` (hash/preservation manifest generator).
Disposable database files were created and removed by the test harness.

All unrelated local changes are preserved. Hash verification against the previous
manifest covers migration 012, RouteScroll, sitemap, frontend order guards,
dependencies, prior audit artifacts and all other existing dirty/untracked files
outside this exact delta. No frontend application source was changed for refunds.

## Validation actually run

- **50 groups PASS on PostgreSQL 17.10** using the existing isolated runtime:
  26 original groups, 23 new refund groups and one additional frontend group.
- Existing XPay signature/mode/idempotency regression suite: PASS.
- Frontend TypeScript `tsc -b`: PASS.
- Shared XPay TypeScript under strict checking: PASS.
- Webhook TypeScript: PASS using local Deno/remote-client declarations. This checks
  source typing, not real hosted Deno or Supabase SDK response typing.
- Repository Oxlint: PASS with the same ten pre-existing warnings; no new warnings.
- `git diff --check`: PASS; Windows line-ending advisories only.

Coverage includes full/partial/multiple refunds, pending/failed/canceled status,
same-event and cross-event refund duplicates, array and refunds.data snapshots,
stale snapshots, invalid mode/signature/payload/amount/currency, missing/ambiguous
association, refund-before-paid retry, identity conflicts, cumulative over-refund,
database failure at final acknowledgment and clean retry, paid-but-cancelled orders,
historical dedupe recovery, unchanged stock and fulfillment guards. Real PostgreSQL
blocked-lock assertions prove serialization on separate connections, including
signed webhook requests and both admin/refund transaction orders.

The first new handler test exposed JSON-array serialization in the local transport;
the harness was fixed to match PostgREST. A later run was interrupted by zero free
space on C:. Only that run's verified abandoned cluster was removed. A completed
46-group run used a new disposable directory under D:\work, cleaned afterward;
the final expanded 50-group run completed on C: after free space recovered. No user
files were deleted to make room. Logs for invalid signatures and synthetic database
failures are expected negative-test evidence, not remaining failures.

The previous scroll/build checks were not unnecessarily repeated: RouteScroll and
frontend application source did not change. Full/partial refund service mapping,
session-storage persistence and actual React page rendering ran in the 50 groups.

## Historical refund investigation and recovery — plan only

Production historical event counts, payloads, actual provider refund totals and
affected payment/order identities are **unknown**; no production/provider account
access was performed. The old event table contains IDs/types, not original payloads.
Local tests reproduce the old false processed marker and prove fresh verified
replay now populates the ledger and updates its marker without deleting history.

After separately approved access and staging rehearsal:

1. Take a recoverable backup and export a read-only inventory of events with types
   refund.created, refund.failed and charge.refunded where refunds_applied=false.
   Include payment/order IDs, stored session/intent references, amounts/currency,
   payment states, cancellation state, stock markers and current timestamps.
   Also inventory partial/full refunded payments without complete ledger evidence.
2. Correlate provider Workbench events/refunds using event ID and verified intent/
   charge IDs. Review live/test mode and EGP amounts. Page through all relevant
   provider refund history, including multiple partial refunds; do not infer that
   an event's lack of a saved payment_id means no financial association exists.
3. Identify missing intent references, duplicate associations, over-refunds,
   payment/order mismatches and incorrect historic full-refund classifications.
   Prepare an explicit per-payment repair plan; no broad SQL status reset.
4. Deploy only after staging/cutover approval. Replay retained events through
   provider Resend using fresh signatures. The refund route bypasses generic old
   markers; the atomic marker records completed reconciliation. Never delete all
   dedupe rows, disable signature verification or replay an expired signature.
5. Verify all individual refund IDs/amounts/statuses, cumulative successful totals,
   payment/order agreement, event refunds_applied markers and unchanged inventory.
   Same-refund success is counted once across event types; retry failures explicitly.
6. Missing/expired provider events or old amounts incorrectly classified as fully
   refunded need a separate authenticated reconciliation/import process using
   provider-verified evidence and explicit repair approval. This change adds no
   unauthenticated repair endpoint and does not auto-downgrade historical states.

Example approved-read-only inventory query for the future migrated environment:

```sql
select event_id, event_type, payment_id, created_at
from public.xpay_webhook_events
where event_type in ('refund.created', 'refund.failed', 'charge.refunded')
  and not refunds_applied
order by created_at, event_id;
```

This query has not been run against production. Before 013, inspect the same event
types without referencing the new column. Workbench has bounded event retention;
verify availability and replay permissions before designing a maintenance window.

## Staging and release requirements

Isolated Supabase staging remains mandatory and has not run. After explicit cloud
approval, rehearse the full migration chain with synthetic legacy orders, apply
012 then 013 exactly once, inspect effective RLS/default/column/inherited grants,
and call the RPC through real PostgREST as anon/customer/admin/service roles.
Verify schema cache, actual hosted Deno behavior, real Supabase client serialization,
both documented charge refund-list forms and fixtures for the account API version.
No real or provider test payments/refunds are required or authorized.

Replay synthetic old false markers and test separate-connection webhook/admin
races, checkout completion before/after refunds, all rollback paths and actual
frontend guest-token/status refresh behavior. Measure locks and migration duration.
Prove server-side maintenance gating, writer drain, durable retention/replay and
reopening in that environment before production approval.

The coordinated release sequence is now: approved reliable writer gate/drain,
012 then 013, schema-cache refresh, compatible reviewed XPay bundles, compatible
frontend, read-only release checks, retained-event reconciliation, then controlled
reopening. The prior shared-helper changes require explicit bundle review across
all three XPay functions. Never deploy the new webhook before 013 or revert only
the database/handlers after financial traffic resumes; prefer a forward fix.

Remaining production blockers are full Supabase staging, verified GitHub publishing
identity (last audit returned 401), production identity/ledger/version/grant checks,
backup/recovery evidence, historical refund reconciliation planning and a rehearsed
server-side maintenance/event-recovery gate. These were not resumed or bypassed.

## Official contracts consulted

- [Refund integration and lifecycle](https://docs.xpay.app/en/integrate/refunds)
- [RefundAPI schema](https://docs.xpay.app/en/api-reference/objects/refund)
- [ChargeAPI schema](https://docs.xpay.app/en/api-reference/objects/charge)
- [Event reference and envelope](https://docs.xpay.app/en/integrate/webhooks/event-reference)
- [Signature verification](https://docs.xpay.app/en/integrate/webhooks/verifying-signatures)
- [Object model and provider identifiers](https://docs.xpay.app/en/integrate/object-model)
