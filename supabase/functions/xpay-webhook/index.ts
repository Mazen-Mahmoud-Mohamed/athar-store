import { textResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'
import {
  requireWebhookSecret,
  verifyXPaySignature,
  type XPayCheckoutSession,
} from '../_shared/xpay.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return textResponse(req, 'method_not_allowed', 405)
  }

  try {
    const secret = requireWebhookSecret(Deno.env.get('XPAY_WEBHOOK_SECRET'))
    const rawBody = await req.text()
    const signature =
      req.headers.get('XPay-Signature') ?? req.headers.get('xpay-signature')

    const verified = await verifyXPaySignature(rawBody, signature, secret)
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
    if (!session?.id) {
      // Record empty/unknown payloads so retries don't loop forever.
      await supabase.from('xpay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
      })
      return textResponse(req, 'ok', 200)
    }

    const paymentIdFromMeta = session.metadata?.athar_payment_id
    let paymentQuery = supabase.from('payments').select('id, order_id, status')
    if (paymentIdFromMeta) {
      paymentQuery = paymentQuery.eq('id', paymentIdFromMeta)
    } else {
      paymentQuery = paymentQuery.eq('provider_session_id', session.id)
    }

    const { data: payment, error: paymentLookupError } = await paymentQuery.maybeSingle()
    if (paymentLookupError || !payment) {
      await supabase.from('xpay_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
      })
      return textResponse(req, 'ok', 200)
    }

    const paymentIntentId =
      session.paymentIntentId ??
      session.paymentIntent?.id ??
      null

    // Process FIRST (RPCs are idempotent), then record event id.
    // This avoids permanently swallowing a paid event when insert-before-process fails mid-way.
    if (
      (event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded') &&
      session.paymentStatus === 'paid'
    ) {
      const { error } = await supabase.rpc('mark_xpay_order_paid', {
        p_payment_id: payment.id,
        p_provider_session_id: session.id,
        p_provider_payment_intent_id: paymentIntentId,
        p_provider_status: session.status ?? null,
        p_provider_payment_status: session.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook mark paid failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const { error } = await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: payment.id,
        p_payment_status: 'failed',
        p_provider_session_id: session.id,
        p_provider_status: session.status ?? null,
        p_provider_payment_status: session.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook cancel failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (event.type === 'checkout.session.expired') {
      const { error } = await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: payment.id,
        p_payment_status: 'expired',
        p_provider_session_id: session.id,
        p_provider_status: session.status ?? null,
        p_provider_payment_status: session.paymentStatus ?? null,
      })
      if (error) {
        console.error('xpay-webhook expire failed:', error.message)
        return textResponse(req, 'processing_failed', 500)
      }
    } else if (event.type === 'refund.created' || event.type === 'charge.refunded') {
      // Only mutate payments that were actually successful.
      if (
        payment.status === 'successful' ||
        payment.status === 'partially_refunded' ||
        payment.status === 'refunded'
      ) {
        const amountRefunded = Number(
          (session as { amountRefunded?: number }).amountRefunded ?? Number.NaN,
        )
        const amountTotal = Number(session.amountTotal ?? Number.NaN)
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
            provider_status: session.status ?? null,
            provider_payment_status: session.paymentStatus ?? null,
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
    } else if (session.status || session.paymentStatus) {
      await supabase
        .from('payments')
        .update({
          provider_session_id: session.id,
          provider_status: session.status ?? null,
          provider_payment_status: session.paymentStatus ?? null,
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
      // Processing succeeded; event insert failed. Return 500 so XPay retries —
      // handler is idempotent on payment RPCs.
      console.error('xpay-webhook dedupe insert failed')
      return textResponse(req, 'dedupe_failed', 500)
    }

    return textResponse(req, 'ok', 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN'
    if (message === 'XPAY_WEBHOOK_SECRET_MISSING' || message === 'XPAY_WEBHOOK_SECRET_INVALID') {
      return textResponse(req, 'misconfigured', 500)
    }
    console.error('xpay-webhook error:', message)
    return textResponse(req, 'error', 500)
  }
})
