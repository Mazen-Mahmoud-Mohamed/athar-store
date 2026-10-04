-- أثر / athar — 009_xpay_service_role_rpc_grants
-- Edge Functions use the service_role client. Migration 008 revoked PUBLIC
-- execute on XPay RPCs and granted only anon/authenticated where appropriate.
-- Without an explicit service_role grant, xpay-create-payment fails with:
--   permission denied for function create_guest_order
--
-- This migration adds EXECUTE for service_role only.
-- It does not change RPC bodies, RLS, or anon/authenticated grants.

-- Signatures match migration 008 / current repository definitions.

grant execute on function public.create_guest_order(
  text,
  text,
  text,
  text,
  jsonb,
  public.payment_method
) to service_role;

grant execute on function public.mark_xpay_order_paid(
  uuid,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.cancel_unpaid_xpay_order(
  uuid,
  public.payment_status,
  text,
  text,
  text
) to service_role;

grant execute on function public.cancel_xpay_order_without_payment(
  uuid
) to service_role;
