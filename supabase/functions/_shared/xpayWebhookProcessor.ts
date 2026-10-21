import { textResponse } from './cors.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  assertPaymentCanBeMarkedSuccessful, assertSessionMatchesPayment, assertSessionMatchesMode,
  egpToMinorUnits, isAuthoritativePaidSession, isPaidCheckoutEventType, isRefundEventType,
  parseRefundEvent, type XPayCheckoutSession, type XPayEvent, type XPayMode,
} from './xpay.ts'

// Only invoked with a durable, signature-verified inbox payload; never with worker request data.
async function processXpayEvent(req: Request, supabase: SupabaseClient, event: XPayEvent, xpayMode: XPayMode): Promise<Response> {
    if (isRefundEventType(event.type)) {
      const { intentId, refunds, chargeAmount } = parseRefundEvent(xpayMode, event)
      // Refund/Charge IDs are not checkout session IDs. Metadata cannot associate money.
      const { data: payment, error: lookupError } = await supabase.from('payments')
        .select('id, amount, provider_payment_intent_id')
        .eq('provider', 'xpay')
        .eq('provider_payment_intent_id', intentId)
        .maybeSingle()
      if (lookupError || !payment) return textResponse(req, 'refund_unassociated', 500)
      if (chargeAmount !== null && chargeAmount !== egpToMinorUnits(payment.amount)) {
        return textResponse(req, 'refund_amount_mismatch', 400)
      }
      // This RPC owns dedupe as well as financial writes. Old generic event markers
      // are deliberately reprocessed so a freshly signed historical replay can heal them.
      const { error } = await supabase.rpc('apply_xpay_refund_event', {
        p_payment_id: payment.id, p_event_id: event.id, p_event_type: event.type,
        p_mode: xpayMode, p_refunds: refunds,
      })
      if (error) {
        console.error('xpay-webhook refund processing failed:', error.code ?? 'database_error')
        return textResponse(req, 'refund_processing_failed', 500)
      }
      return textResponse(req, 'ok', 200)
    }

    const session = (event.data?.object ?? null) as XPayCheckoutSession | null
    try {
      assertSessionMatchesMode(xpayMode, session)
    } catch {
      // Signed but wrong/missing mode: do not record event id (avoid poison), do not mark paid.
      return textResponse(req, 'mode_mismatch', 400)
    }

    const trustedSession = session as XPayCheckoutSession
    const sessionId = String(trustedSession.id).trim()
    const paymentIdFromMeta = trustedSession.metadata?.athar_payment_id

    // Reject cross-mode replays before the global event-id dedupe lookup.
    const { data: seen, error: seenError } = await supabase
      .from('xpay_webhook_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle()

    if (seenError) return textResponse(req, 'dedupe_lookup_failed', 503)
    if (seen) {
      return textResponse(req, 'ok', 200)
    }

    // Authoritative lookup is provider session id. Metadata is a hint only.
    const { data: bySession, error: sessionLookupError } = await supabase
      .from('payments')
      .select('id, order_id, provider, status, amount, currency, provider_session_id, metadata')
      .eq('provider', 'xpay')
      .eq('provider_session_id', sessionId)
      .maybeSingle()
    if (sessionLookupError) {
      return textResponse(req, 'processing_failed', 500)
    }

    let payment = bySession
    if (!payment && paymentIdFromMeta) {
      const { data: byMeta, error: metaLookupError } = await supabase
        .from('payments')
        .select('id, order_id, provider, status, amount, currency, provider_session_id, metadata')
        .eq('provider', 'xpay')
        .eq('id', paymentIdFromMeta)
        .maybeSingle()
      if (metaLookupError) {
        return textResponse(req, 'processing_failed', 500)
      }
      if (
        byMeta &&
        byMeta.provider_session_id &&
        byMeta.provider_session_id !== sessionId
      ) {
        return textResponse(req, 'mode_mismatch', 400)
      }
      payment = byMeta
    }

    // The session may be delivered before checkout has stored its association.
    // Preserve it in the inbox for recovery; a generic marker would lose the payment.
    if (!payment) return textResponse(req, 'payment_unassociated', 503)

    const { data: order, error: orderLookupError } = await supabase
      .from('orders')
      .select('id, status, payment_method, payment_status, total')
      .eq('id', payment.order_id)
      .maybeSingle()
    if (orderLookupError || !order) {
      return textResponse(req, 'processing_failed', 500)
    }

    assertSessionMatchesPayment(xpayMode, trustedSession, payment, order)

    const paymentIntentId =
      trustedSession.paymentIntentId ??
      trustedSession.paymentIntent?.id ??
      null

    // Process FIRST (RPCs are idempotent), then record event id.
    if (isPaidCheckoutEventType(event.type) && isAuthoritativePaidSession(trustedSession)) {
      // An older success delivery must not undo a subsequently recorded refund.
      if (['refunded', 'partially_refunded'].includes(payment.status) &&
          payment.status === order.payment_status) {
        const { error } = await supabase.from('xpay_webhook_events').insert({
          event_id: event.id, event_type: event.type, payment_id: payment.id,
        })
        if (error && error.code !== '23505') return textResponse(req, 'dedupe_failed', 500)
        return textResponse(req, 'ok', 200)
      }
      assertPaymentCanBeMarkedSuccessful(
        payment.status,
        order.status,
        order.payment_status,
      )
      const { error } = await supabase.rpc('mark_xpay_order_paid', {
        p_payment_id: payment.id,
        p_provider_session_id: trustedSession.id,
        p_provider_payment_intent_id: paymentIntentId,
        p_provider_status: trustedSession.status ?? null,
        p_provider_payment_status: trustedSession.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook mark paid failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const { error } = await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: payment.id,
        p_payment_status: 'failed',
        p_provider_session_id: trustedSession.id,
        p_provider_status: trustedSession.status ?? null,
        p_provider_payment_status: trustedSession.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook cancel failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (event.type === 'checkout.session.expired') {
      const { error } = await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: payment.id,
        p_payment_status: 'expired',
        p_provider_session_id: trustedSession.id,
        p_provider_status: trustedSession.status ?? null,
        p_provider_payment_status: trustedSession.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook expire failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (trustedSession.status || trustedSession.paymentStatus) {
      const { error: providerUpdateError } = await supabase
        .from('payments')
        .update({
          provider_session_id: trustedSession.id,
          provider_status: trustedSession.status ?? null,
          provider_payment_status: trustedSession.paymentStatus ?? null,
          provider_payment_intent_id: paymentIntentId,
        })
        .eq('id', payment.id)
        .in('status', ['pending', 'requires_action'])
      if (providerUpdateError) return textResponse(req, 'provider_update_failed', 503)
    }

    const { error: dedupeError } = await supabase.from('xpay_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      payment_id: payment.id,
    })

    if (dedupeError && dedupeError.code !== '23505') {
      console.error('xpay-webhook dedupe insert failed')
      return textResponse(req, 'dedupe_failed', 500)
    }

    return textResponse(req, 'ok', 200)

}

export function rpcValue(data: unknown, name: string): unknown {
  return Array.isArray(data) ? data[0]?.[name] : data
}

export type WebhookClaim = { event_id: string; payload: XPayEvent; mode: XPayMode; lease_token: string }

export async function processWebhookClaim(req: Request, supabase: SupabaseClient, claim: WebhookClaim, mode: XPayMode): Promise<Response> {
  let response: Response
  try {
    // Revalidate mode/contract on recovery. The worker cannot substitute payloads or mode.
    if (claim.mode !== mode) throw new Error('XPAY_SESSION_MODE_MISMATCH')
    response = await processXpayEvent(req, supabase, claim.payload, mode)
  } catch {
    response = textResponse(req, 'processing_failed', 500)
  }
  if (response.ok) {
    const { error } = await supabase.rpc('mark_xpay_webhook_event_processed', {
      p_event_id: claim.event_id, p_lease_token: claim.lease_token,
    })
    return error ? textResponse(req, 'queue_ack_failed', 503) : response
  }
  // Never log payloads or leave a failed event financially acknowledged.
  const { error } = await supabase.rpc('retry_xpay_webhook_event', {
    p_event_id: claim.event_id, p_lease_token: claim.lease_token, p_error: 'processing_failed',
  })
  return error ? textResponse(req, 'queue_retry_failed', 503) : response
}

