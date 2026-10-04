-- أثر / athar — 010_xpay_service_role_table_grants
-- Edge Functions use the service_role client against public.payments and
-- public.xpay_webhook_events. Migration 008 enabled RLS and revoked
-- anon/authenticated DML, but never granted table privileges to service_role.
-- RLS bypass does not replace table-level GRANT requirements, so
-- xpay-create-payment fails at payments INSERT after create_guest_order.
--
-- This migration grants only the DML privileges required by the current
-- Edge Function implementations. It does not change RLS, table definitions,
-- RPCs, or anon/authenticated/PUBLIC grants.

-- public.payments
--   xpay-create-payment: SELECT (idempotency), INSERT (new row), UPDATE (session/idempotency)
--   xpay-payment-status: SELECT (guest lookup + re-read), UPDATE (reconcile provider fields)
--   xpay-webhook:        SELECT (session/payment lookup), UPDATE (refund / provider sync)
--   DELETE is not used by any current Edge Function against this table.
grant select, insert, update on table public.payments to service_role;

-- public.xpay_webhook_events
--   xpay-webhook: SELECT (event_id dedupe), INSERT (record processed / unknown events)
--   UPDATE/DELETE are not used by any current Edge Function against this table.
grant select, insert on table public.xpay_webhook_events to service_role;
