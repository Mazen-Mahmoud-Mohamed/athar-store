import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'
import {
  mapSessionToInternalStatus,
  requireTestSecretKey,
  retrieveCheckoutSession,
} from '../_shared/xpay.ts'

type StatusBody = {
  paymentId?: string
  guestToken?: string
  sessionId?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'method_not_allowed' }, 405)
  }

  try {
    const body = (await req.json()) as StatusBody
    const paymentId = String(body.paymentId ?? '').trim()
    const guestToken = String(body.guestToken ?? '').trim()
    const sessionId = String(body.sessionId ?? '').trim()

    if (!guestToken || (!paymentId && !sessionId)) {
      return jsonResponse(req, { error: 'INVALID_REQUEST' }, 400)
    }

    const supabase = createServiceClient()

    let query = supabase
      .from('payments')
      .select(
        'id, order_id, status, amount, currency, provider_session_id, provider_status, provider_payment_status, guest_token',
      )
      .eq('guest_token', guestToken)
      .eq('provider', 'xpay')

    if (paymentId) query = query.eq('id', paymentId)
    if (sessionId) query = query.eq('provider_session_id', sessionId)

    const { data: payment, error: paymentError } = await query.maybeSingle()
    if (paymentError || !payment) {
      return jsonResponse(req, { error: 'PAYMENT_NOT_FOUND' }, 404)
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, payment_method, payment_status, customer_name, subtotal, total')
      .eq('id', payment.order_id)
      .maybeSingle()

    if (orderError || !order) {
      return jsonResponse(req, { error: 'ORDER_NOT_FOUND' }, 404)
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('product_name, unit_price, quantity, subtotal')
      .eq('order_id', order.id)
      .order('id', { ascending: true })

    // If still pending, reconcile from XPay server (never from browser query alone).
    let paymentStatus = payment.status as string
    if (
      payment.provider_session_id &&
      (paymentStatus === 'pending' || paymentStatus === 'requires_action')
    ) {
      try {
        const secretKey = requireTestSecretKey(Deno.env.get('XPAY_SECRET_KEY'))
        const session = await retrieveCheckoutSession(
          secretKey,
          payment.provider_session_id,
        )
        const mapped = mapSessionToInternalStatus(session)

        if (mapped === 'successful' && session.paymentStatus === 'paid') {
          await supabase.rpc('mark_xpay_order_paid', {
            p_payment_id: payment.id,
            p_provider_session_id: session.id,
            p_provider_payment_intent_id:
              session.paymentIntentId ?? session.paymentIntent?.id ?? null,
            p_provider_status: session.status ?? null,
            p_provider_payment_status: session.paymentStatus ?? null,
          })
          paymentStatus = 'successful'
        } else if (mapped === 'expired') {
          await supabase.rpc('cancel_unpaid_xpay_order', {
            p_payment_id: payment.id,
            p_payment_status: 'expired',
            p_provider_session_id: session.id,
            p_provider_status: session.status ?? null,
            p_provider_payment_status: session.paymentStatus ?? null,
          })
          paymentStatus = 'expired'
        } else if (mapped === 'requires_action' && paymentStatus === 'pending') {
          await supabase
            .from('payments')
            .update({
              status: 'requires_action',
              provider_status: session.status ?? null,
              provider_payment_status: session.paymentStatus ?? null,
            })
            .eq('id', payment.id)
          await supabase
            .from('orders')
            .update({ payment_status: 'requires_action' })
            .eq('id', order.id)
          paymentStatus = 'requires_action'
        } else {
          await supabase
            .from('payments')
            .update({
              provider_status: session.status ?? null,
              provider_payment_status: session.paymentStatus ?? null,
            })
            .eq('id', payment.id)
        }
      } catch (reconcileError) {
        const msg =
          reconcileError instanceof Error ? reconcileError.message : 'reconcile_failed'
        console.error('xpay-payment-status reconcile:', msg)
      }
    }

    // Re-read authoritative rows after possible reconcile.
    const { data: freshPayment } = await supabase
      .from('payments')
      .select('status, provider_status, provider_payment_status')
      .eq('id', payment.id)
      .single()

    const { data: freshOrder } = await supabase
      .from('orders')
      .select('status, payment_status, customer_name, subtotal, total')
      .eq('id', order.id)
      .single()

    const verifiedPaymentStatus = freshPayment?.status ?? paymentStatus
    const verifiedOrderStatus = freshOrder?.status ?? order.status

    return jsonResponse(req, {
      paymentId: payment.id,
      orderId: order.id,
      paymentStatus: verifiedPaymentStatus,
      orderStatus: verifiedOrderStatus,
      amount: Number(payment.amount),
      currency: payment.currency,
      providerStatus: freshPayment?.provider_status ?? payment.provider_status,
      providerPaymentStatus:
        freshPayment?.provider_payment_status ?? payment.provider_payment_status,
      confirmation: {
        id: order.id,
        customerName: freshOrder?.customer_name ?? order.customer_name,
        subtotal: Number(freshOrder?.subtotal ?? order.subtotal),
        total: Number(freshOrder?.total ?? order.total),
        status: verifiedOrderStatus,
        paymentMethod: 'xpay',
        paymentStatus: verifiedPaymentStatus,
        items: (items ?? []).map((item) => ({
          productName: item.product_name,
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
        })),
      },
      // Explicit: browser return alone is never success.
      verified: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN'
    if (message === 'XPAY_LIVE_KEY_REJECTED') {
      return jsonResponse(req, { error: message }, 500)
    }
    console.error('xpay-payment-status error:', message)
    return jsonResponse(req, { error: 'STATUS_LOOKUP_FAILED' }, 500)
  }
})
