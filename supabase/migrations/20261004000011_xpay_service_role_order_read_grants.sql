-- أثر / athar — 011_xpay_service_role_order_read_grants
-- After migrations 009–010, xpay-payment-status can read payments but still
-- fails with ORDER_NOT_FOUND because service_role lacks table privileges on
-- public.orders / public.order_items (RLS bypass does not replace GRANTs).
--
-- Privileges below are the minimum required by current Edge Function code.
-- Order create / paid / cancel mutations remain on SECURITY DEFINER RPCs.
-- This migration does not change RLS, table definitions, RPCs, or
-- anon/authenticated/PUBLIC grants.

-- public.orders
--   xpay-create-payment: SELECT (reuse-path order validation)
--   xpay-payment-status: SELECT (lookup + re-read), UPDATE (requires_action)
--   xpay-webhook:        UPDATE (refund payment_status sync)
--   INSERT/DELETE are not used directly by Edge Functions against this table.
grant select, update on table public.orders to service_role;

-- public.order_items
--   xpay-create-payment: SELECT (reuse-path line items)
--   xpay-payment-status: SELECT (success-page confirmation lines)
--   INSERT/UPDATE/DELETE are not used directly by Edge Functions against this table.
grant select on table public.order_items to service_role;
