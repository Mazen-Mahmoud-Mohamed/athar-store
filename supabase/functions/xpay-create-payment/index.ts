import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { createServiceClient, storefrontBaseUrl } from '../_shared/supabaseAdmin.ts'
import {
  createCheckoutSession,
  egpToMinorUnits,
  requireTestSecretKey,
} from '../_shared/xpay.ts'

type CreateBody = {
  customerName?: string
  phone?: string
  address?: string
  notes?: string | null
  items?: Array<{ product_id?: string; quantity?: number }>
  idempotencyKey?: string
}

type OrderLine = {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'method_not_allowed' }, 405)
  }

  const supabase = createServiceClient()
  let createdOrderId: string | null = null
  let createdPaymentId: string | null = null

  try {
    const secretKey = requireTestSecretKey(Deno.env.get('XPAY_SECRET_KEY'))
    const body = (await req.json()) as CreateBody

    const customerName = String(body.customerName ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const address = String(body.address ?? '').trim()
    const notes = body.notes == null ? null : String(body.notes)
    const items = Array.isArray(body.items) ? body.items : []
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 128)
        : crypto.randomUUID()

    if (!items.length) {
      return jsonResponse(req, { error: 'ORDER_EMPTY', message: 'السلة فارغة.' }, 400)
    }

    // Reuse / classify prior attempt with the same idempotency key.
    const { data: existingPayment } = await supabase
      .from('payments')
      .select(
        'id, guest_token, provider_session_id, status, order_id, amount, metadata, stock_released',
      )
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingPayment?.status === 'successful') {
      return jsonResponse(
        req,
        {
          error: 'PAYMENT_ALREADY_SUCCESSFUL',
          message: 'تم تأكيد دفع سابق لهذا الطلب.',
        },
        409,
      )
    }

    // Terminal unpaid outcomes: free the idempotency key and start a fresh order.
    // Never reopen a cancelled/failed payment row (would skip stock re-decrement).
    if (
      existingPayment &&
      ['failed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].includes(
        existingPayment.status,
      )
    ) {
      await supabase
        .from('payments')
        .update({
          idempotency_key: `${idempotencyKey}:superseded:${existingPayment.id}`,
        })
        .eq('id', existingPayment.id)
    }

    const reusable =
      existingPayment &&
      (existingPayment.status === 'pending' || existingPayment.status === 'requires_action')
        ? existingPayment
        : null

    if (reusable) {
      const checkoutUrl = (reusable.metadata as { checkout_url?: string } | null)?.checkout_url
      if (reusable.provider_session_id && checkoutUrl) {
        return jsonResponse(req, {
          paymentId: reusable.id,
          guestToken: reusable.guest_token,
          orderId: reusable.order_id,
          checkoutUrl,
          sessionId: reusable.provider_session_id,
          amount: reusable.amount,
          reused: true,
        })
      }
    }

    let paymentId = reusable?.id as string | undefined
    let guestToken = reusable?.guest_token as string | undefined
    let orderId = reusable?.order_id as string | undefined
    let orderCustomerName = customerName
    let orderSubtotal = 0
    let orderTotal = 0
    let orderItems: OrderLine[] = []

    if (paymentId && orderId) {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('id, customer_name, subtotal, total, status, payment_status')
        .eq('id', orderId)
        .maybeSingle()
      const { data: itemRows } = await supabase
        .from('order_items')
        .select('product_id, product_name, unit_price, quantity, subtotal')
        .eq('order_id', orderId)

      if (
        !orderRow ||
        !itemRows?.length ||
        orderRow.status !== 'pending' ||
        orderRow.payment_status === 'successful'
      ) {
        // Stale reusable row — force fresh attempt.
        await supabase
          .from('payments')
          .update({
            idempotency_key: `${idempotencyKey}:stale:${paymentId}`,
          })
          .eq('id', paymentId)
        paymentId = undefined
        guestToken = undefined
        orderId = undefined
      } else {
        orderCustomerName = orderRow.customer_name
        orderSubtotal = Number(orderRow.subtotal)
        orderTotal = Number(orderRow.total)
        orderItems = itemRows.map((item) => ({
          product_id: String(item.product_id ?? ''),
          product_name: item.product_name,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
        }))
      }
    }

    if (!paymentId || !orderId) {
      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }))

      const { data: confirmation, error: orderError } = await supabase.rpc(
        'create_guest_order',
        {
          p_customer_name: customerName,
          p_phone: phone,
          p_address: address,
          p_notes: notes,
          p_items: rpcItems,
          p_payment_method: 'xpay',
        },
      )

      if (orderError) {
        const code = String(orderError.message ?? 'ORDER_CREATE_FAILED')
        return jsonResponse(
          req,
          { error: code, message: mapOrderError(code) },
          400,
        )
      }

      const order = confirmation as {
        id: string
        customer_name: string
        subtotal: number
        total: number
        items: OrderLine[]
      }

      orderId = order.id
      createdOrderId = order.id
      orderCustomerName = order.customer_name
      orderSubtotal = Number(order.subtotal)
      orderTotal = Number(order.total)
      orderItems = order.items

      if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
        await supabase.rpc('cancel_xpay_order_without_payment', {
          p_order_id: orderId,
        })
        return jsonResponse(req, { error: 'INVALID_ORDER_TOTAL' }, 500)
      }

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id: order.id,
          provider: 'xpay',
          amount: orderTotal,
          currency: 'EGP',
          status: 'pending',
          idempotency_key: idempotencyKey,
          stock_released: false,
          metadata: {
            source: 'athar_storefront',
            mode: 'test',
          },
        })
        .select('id, guest_token')
        .single()

      if (paymentError || !payment) {
        await supabase.rpc('cancel_xpay_order_without_payment', {
          p_order_id: orderId,
        })
        return jsonResponse(req, { error: 'PAYMENT_CREATE_FAILED' }, 500)
      }

      paymentId = payment.id
      guestToken = payment.guest_token
      createdPaymentId = payment.id
    }

    if (!paymentId || !guestToken || !orderId) {
      return jsonResponse(req, { error: 'PAYMENT_CREATE_FAILED' }, 500)
    }

    const base = storefrontBaseUrl()
    const returnUrl =
      `${base}/order-success?xpay_session={CHECKOUT_SESSION_ID}` +
      `&payment_id=${paymentId}&guest_token=${guestToken}`
    const cancelUrl =
      `${base}/order-success?xpay_cancel=1` +
      `&payment_id=${paymentId}&guest_token=${guestToken}`

    const expectedMinor = egpToMinorUnits(orderTotal)
    // Any failure from here must release stock for this payment attempt.
    createdPaymentId = paymentId

    let session
    try {
      session = await createCheckoutSession({
        secretKey,
        idempotencyKey: `athar_${paymentId}`,
        afterCompletionUrl: returnUrl,
        cancelUrl,
        customerName: orderCustomerName,
        customerPhone: phone,
        metadata: {
          athar_order_id: orderId,
          athar_payment_id: paymentId,
          athar_mode: 'test',
        },
        lineItems: orderItems.map((item) => ({
          name: String(item.product_name).slice(0, 120),
          unitAmountMinor: egpToMinorUnits(Number(item.unit_price)),
          quantity: Number(item.quantity),
        })),
      })
    } catch (sessionError) {
      await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: paymentId,
        p_payment_status: 'failed',
      })
      createdPaymentId = null
      createdOrderId = null
      throw sessionError
    }

    if (session.currency && String(session.currency).toUpperCase() !== 'EGP') {
      await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: paymentId,
        p_payment_status: 'failed',
        p_provider_session_id: session.id,
        p_provider_status: session.status ?? null,
        p_provider_payment_status: session.paymentStatus ?? null,
      })
      createdPaymentId = null
      createdOrderId = null
      return jsonResponse(req, { error: 'XPAY_CURRENCY_MISMATCH' }, 500)
    }

    if (
      typeof session.amountTotal === 'number' &&
      session.amountTotal !== expectedMinor
    ) {
      await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: paymentId,
        p_payment_status: 'failed',
        p_provider_session_id: session.id,
        p_provider_status: session.status ?? null,
        p_provider_payment_status: session.paymentStatus ?? null,
      })
      createdPaymentId = null
      createdOrderId = null
      return jsonResponse(req, { error: 'XPAY_AMOUNT_MISMATCH' }, 500)
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update({
        provider_session_id: session.id,
        provider_status: session.status ?? null,
        provider_payment_status: session.paymentStatus ?? null,
        metadata: {
          source: 'athar_storefront',
          mode: 'test',
          checkout_url: session.url,
          amount_minor: expectedMinor,
        },
      })
      .eq('id', paymentId)

    if (updateError) {
      await supabase.rpc('cancel_unpaid_xpay_order', {
        p_payment_id: paymentId,
        p_payment_status: 'failed',
        p_provider_session_id: session.id,
      })
      createdPaymentId = null
      createdOrderId = null
      return jsonResponse(req, { error: 'PAYMENT_SESSION_SAVE_FAILED' }, 500)
    }

    // Success path — do not compensate in outer catch.
    createdPaymentId = null
    createdOrderId = null

    return jsonResponse(req, {
      paymentId,
      guestToken,
      orderId,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: orderTotal,
      currency: 'EGP',
      confirmation: {
        id: orderId,
        customerName: orderCustomerName,
        subtotal: orderSubtotal,
        total: orderTotal,
        items: orderItems.map((item) => ({
          productName: item.product_name,
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
        })),
        paymentMethod: 'xpay',
        paymentStatus: 'pending',
        status: 'pending',
      },
      reused: Boolean(reusable),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'

    // Compensate reserved stock if we created order/payment but session setup failed.
    try {
      if (createdPaymentId) {
        await supabase.rpc('cancel_unpaid_xpay_order', {
          p_payment_id: createdPaymentId,
          p_payment_status: 'failed',
        })
      } else if (createdOrderId) {
        await supabase.rpc('cancel_xpay_order_without_payment', {
          p_order_id: createdOrderId,
        })
      }
    } catch (compensateError) {
      console.error(
        'xpay-create-payment compensate failed:',
        compensateError instanceof Error ? compensateError.message : 'unknown',
      )
    }

    if (message === 'XPAY_LIVE_KEY_REJECTED' || message === 'XPAY_LIVE_SESSION_REJECTED') {
      return jsonResponse(
        req,
        {
          error: message,
          message: 'وضع الاختبار فقط — تم رفض مفتاح أو جلسة حية.',
        },
        500,
      )
    }
    if (message === 'XPAY_SECRET_KEY_MISSING') {
      return jsonResponse(
        req,
        { error: message, message: 'إعداد الدفع غير مكتمل حالياً.' },
        500,
      )
    }
    console.error('xpay-create-payment error:', message)
    return jsonResponse(
      req,
      { error: 'PAYMENT_START_FAILED', message: 'تعذر بدء الدفع الإلكتروني. حاولي مرة أخرى.' },
      500,
    )
  }
})

function mapOrderError(code: string): string {
  if (/PRODUCT_UNAVAILABLE/i.test(code)) {
    return 'أحد المنتجات لم يعد متاحًا. راجعي السلة ثم حاولي مرة أخرى.'
  }
  if (/INSUFFICIENT_STOCK/i.test(code)) {
    return 'الكمية المطلوبة غير متوفرة حاليًا. راجعي السلة ثم حاولي مرة أخرى.'
  }
  if (/ORDER_EMPTY/i.test(code)) {
    return 'السلة فارغة. أضيفي منتجًا قبل إتمام الطلب.'
  }
  if (/CUSTOMER_NAME_REQUIRED/i.test(code)) {
    return 'من فضلك تأكدي من الاسم بالكامل.'
  }
  if (/PHONE_REQUIRED/i.test(code)) {
    return 'من فضلك تأكدي من رقم الهاتف.'
  }
  if (/ADDRESS_REQUIRED/i.test(code)) {
    return 'من فضلك تأكدي من عنوان التوصيل.'
  }
  if (/NOTES_TOO_LONG/i.test(code)) {
    return 'الملاحظات طويلة جدًا. اختصريها ثم حاولي مرة أخرى.'
  }
  return 'تعذر إنشاء الطلب. راجعي البيانات ثم حاولي مرة أخرى.'
}
