import { textResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'
import {
  assertSessionMatchesMode,
  collectWebhookSecrets,
  isAuthoritativePaidSession,
  isPaidCheckoutEventType,
  resolveXpayMode,
  verifyXPaySignatureWithSecrets,
  type XPayCheckoutSession,
} from '../_shared/xpay.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return textResponse(req, 'method_not_allowed', 405)
  }

  try {
    const xpayMode = resolveXpayMode(Deno.env.get('XPAY_MODE'))
    const secrets = collectWebhookSecrets({
      primary: Deno.env.get('XPAY_WEBHOOK_SECRET'),
      secondary: Deno.env.get('XPAY_WEBHOOK_SECRET_SECONDARY'),
    })
    const rawBody = await req.text()
    const signature =
      req.headers.get('XPay-Signature') ?? req.headers.get('xpay-signature')

    const verified = await verifyXPaySignatureWithSecrets(rawBody, signature, secrets)
    if (!verified.valid) {
      console.error('xpay-webhook invalid signature:', verified.reason)
      return textResponse(req, 'invalid signature', 400)
    }

    const event = verified.event
    const supabase = createServiceClient()

    // If we already fully recorded this event id, acknowledge without re-work.
    const { data: seen } = await supabase
      .from('xpay_webhook_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle()

    if (seen) {
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

    // Authoritative lookup is provider session id. Metadata is a hint only.
    const { data: bySession, error: sessionLookupError } = await supabase
      .from('payments')
      .select('id, order_id, status, provider_session_id')
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
        .select('id, order_id, status, provider_session_id')
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

    if (!payment) {
      await supabase.from('xpay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
      })
      return textResponse(req, 'ok', 200)
    }

    const paymentIntentId =
      trustedSession.paymentIntentId ??
      trustedSession.paymentIntent?.id ??
      null

    // Process FIRST (RPCs are idempotent), then record event id.
    if (isPaidCheckoutEventType(event.type) && isAuthoritativePaidSession(trustedSession)) {
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
    } else if (event.type === 'refund.created' || event.type === 'charge.refunded') {
      if (
        payment.status === 'successful' ||
        payment.status === 'partially_refunded' ||
        payment.status === 'refunded'
      ) {
        const amountRefunded = Number(
          (trustedSession as { amountRefunded?: number }).amountRefunded ?? Number.NaN,
        )
        const amountTotal = Number(trustedSession.amountTotal ?? Number.NaN)
        const nextStatus =
          Number.isFinite(amountRefunded) &&
          Number.isFinite(amountTotal) &&
          amountRefunded > 0 &&
          amountRefunded < amountTotal
            ? 'partially_refunded'
            : 'refunded'

        const { error: payErr } = await supabase
          .from('payments')
          .update({
            status: nextStatus,
            provider_status: trustedSession.status ?? null,
            provider_payment_status: trustedSession.paymentStatus ?? null,
          })
          .eq('id', payment.id)
          .in('status', ['successful', 'partially_refunded', 'refunded'])

        if (payErr) {
          console.error('xpay-webhook refund payment update failed:', payErr.message)
          return textResponse(req, 'processing_failed', 500)
        }

        const { error: orderErr } = await supabase
          .from('orders')
          .update({ payment_status: nextStatus })
          .eq('id', payment.order_id)
          .in('payment_status', ['successful', 'partially_refunded', 'refunded'])

        if (orderErr) {
          console.error('xpay-webhook refund order update failed:', orderErr.message)
          return textResponse(req, 'processing_failed', 500)
        }
      }
    } else if (trustedSession.status || trustedSession.paymentStatus) {
      await supabase
        .from('payments')
        .update({
          provider_session_id: trustedSession.id,
          provider_status: trustedSession.status ?? null,
          provider_payment_status: trustedSession.paymentStatus ?? null,
          provider_payment_intent_id: paymentIntentId,
        })
        .eq('id', payment.id)
        .in('status', ['pending', 'requires_action'])
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN'
    if (message === 'XPAY_MODE_MISSING' || message === 'XPAY_MODE_INVALID') {
      return textResponse(req, 'misconfigured', 500)
    }
    if (message === 'XPAY_WEBHOOK_SECRET_MISSING' || message === 'XPAY_WEBHOOK_SECRET_INVALID') {
      return textResponse(req, 'misconfigured', 500)
    }
    if (message === 'XPAY_SESSION_MODE_MISMATCH') {
      return textResponse(req, 'mode_mismatch', 400)
    }
    console.error('xpay-webhook error:', message)
    return textResponse(req, 'error', 500)
  }
})
