import { formatOrderReference } from '@/lib/checkoutValidation'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import type { CartItem, CheckoutPayload } from '@/types'
import type { GuestOrderConfirmation } from '@/services/orderService'

export type PaymentMethodChoice = 'cod' | 'xpay'

export type PaymentStatusValue =
  | 'pending'
  | 'requires_action'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'expired'

export type XPayStartResult = {
  paymentId: string
  guestToken: string
  orderId: string
  checkoutUrl: string
  sessionId?: string
  confirmation: GuestOrderConfirmation
}

export type XPayStatusResult = {
  paymentId: string
  orderId: string
  paymentStatus: PaymentStatusValue
  orderStatus: string
  confirmation: GuestOrderConfirmation
  verified: boolean
}

const PENDING_PAYMENT_KEY = 'athar-xpay-pending-v1'

export type PendingXPayPayment = {
  paymentId: string
  guestToken: string
  orderId: string
  sessionId?: string
  confirmation: GuestOrderConfirmation
}

export function rememberPendingXPayPayment(payload: PendingXPayPayment) {
  try {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function readPendingXPayPayment(): PendingXPayPayment | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PAYMENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingXPayPayment>
    if (
      typeof parsed.paymentId !== 'string' ||
      typeof parsed.guestToken !== 'string' ||
      typeof parsed.orderId !== 'string' ||
      !parsed.confirmation
    ) {
      return null
    }
    return parsed as PendingXPayPayment
  } catch {
    return null
  }
}

export function clearPendingXPayPayment() {
  try {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY)
  } catch {
    // ignore
  }
}

function mapStartError(error: unknown): AppError | null {
  if (!error || typeof error !== 'object') return null
  const message = String((error as { message?: string }).message ?? '')
  const context = (error as { context?: { json?: { message?: string; error?: string } } }).context
  const bodyMessage = context?.json?.message
  const bodyError = context?.json?.error
  const combined = [message, bodyMessage, bodyError].filter(Boolean).join(' ')

  if (/PRODUCT_UNAVAILABLE/i.test(combined)) {
    return new AppError(
      'validation',
      'أحد المنتجات لم يعد متاحًا. راجعي السلة ثم حاولي مرة أخرى.',
      { cause: error },
    )
  }
  if (/INSUFFICIENT_STOCK/i.test(combined)) {
    return new AppError(
      'validation',
      'الكمية المطلوبة غير متوفرة حاليًا. راجعي السلة ثم حاولي مرة أخرى.',
      { cause: error },
    )
  }
  if (/ORDER_EMPTY/i.test(combined)) {
    return new AppError('validation', 'السلة فارغة. أضيفي منتجًا قبل إتمام الطلب.', {
      cause: error,
    })
  }
  if (bodyMessage) {
    return new AppError('validation', bodyMessage, { cause: error })
  }
  return null
}

/**
 * Creates a guest order (server-priced) + XPay Test Hosted Checkout session.
 * Secrets stay on the Edge Function — frontend only receives a checkout URL.
 */
export async function startXPayCheckout(
  payload: CheckoutPayload,
  items: CartItem[],
  idempotencyKey: string,
): Promise<XPayStartResult> {
  if (!items.length) {
    throw new AppError('validation', 'السلة فارغة.')
  }
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'تعذر بدء الدفع حالياً. حاولي مرة أخرى لاحقاً.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('xpay-create-payment', {
      body: {
        customerName: payload.customerName,
        phone: payload.phone,
        address: payload.address,
        notes: payload.notes ?? null,
        idempotencyKey,
        items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      },
    })

    if (error) {
      const mapped = mapStartError(error)
      if (mapped) throw mapped
      throw error
    }

    const row = data as {
      paymentId?: string
      guestToken?: string
      orderId?: string
      checkoutUrl?: string
      sessionId?: string
      confirmation?: {
        id: string
        customerName: string
        subtotal: number
        total: number
        items: GuestOrderConfirmation['items']
        paymentStatus?: PaymentStatusValue
      }
      error?: string
      message?: string
    }

    if (row?.error || !row?.checkoutUrl || !row.paymentId || !row.guestToken || !row.orderId) {
      throw new AppError(
        'database',
        row?.message ?? 'تعذر بدء الدفع الإلكتروني. حاولي مرة أخرى.',
      )
    }

    const confirmation: GuestOrderConfirmation = {
      id: row.confirmation?.id ?? row.orderId,
      reference: formatOrderReference(row.confirmation?.id ?? row.orderId),
      status: 'pending',
      customerName: row.confirmation?.customerName ?? payload.customerName,
      subtotal: Number(row.confirmation?.subtotal ?? 0),
      total: Number(row.confirmation?.total ?? 0),
      items: row.confirmation?.items ?? [],
      paymentMethod: 'xpay',
      paymentStatus: row.confirmation?.paymentStatus ?? 'pending',
    }

    return {
      paymentId: row.paymentId,
      guestToken: row.guestToken,
      orderId: row.orderId,
      checkoutUrl: row.checkoutUrl,
      sessionId: row.sessionId,
      confirmation,
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    const mapped = mapStartError(error)
    if (mapped) throw mapped
    throw toAppError(error, 'تعذر بدء الدفع الإلكتروني. حاولي مرة أخرى.')
  }
}

export async function fetchXPayPaymentStatus(input: {
  paymentId: string
  guestToken: string
  sessionId?: string
}): Promise<XPayStatusResult> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'تعذر التحقق من حالة الدفع حالياً.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('xpay-payment-status', {
      body: {
        paymentId: input.paymentId,
        guestToken: input.guestToken,
        sessionId: input.sessionId,
      },
    })

    if (error) throw error

    const row = data as {
      paymentId?: string
      orderId?: string
      paymentStatus?: PaymentStatusValue
      orderStatus?: string
      confirmation?: {
        id: string
        customerName: string
        subtotal: number
        total: number
        items: GuestOrderConfirmation['items']
        paymentStatus?: PaymentStatusValue
      }
      verified?: boolean
      error?: string
    }

    if (!row?.paymentId || !row.orderId || !row.paymentStatus || !row.confirmation) {
      throw new AppError('database', 'تعذر التحقق من حالة الدفع من الخادم.')
    }

    return {
      paymentId: row.paymentId,
      orderId: row.orderId,
      paymentStatus: row.paymentStatus,
      orderStatus: row.orderStatus ?? 'pending',
      verified: Boolean(row.verified),
      confirmation: {
        id: row.confirmation.id,
        reference: formatOrderReference(row.confirmation.id),
        status: 'pending',
        customerName: row.confirmation.customerName,
        subtotal: Number(row.confirmation.subtotal),
        total: Number(row.confirmation.total),
        items: row.confirmation.items ?? [],
        paymentMethod: 'xpay',
        paymentStatus: row.paymentStatus,
      },
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw toAppError(error, 'تعذر التحقق من حالة الدفع. حاولي تحديث الصفحة.')
  }
}

export function paymentStatusLabel(status: PaymentStatusValue | undefined): string {
  switch (status) {
    case 'successful':
      return 'تم الدفع بنجاح'
    case 'pending':
      return 'بانتظار تأكيد الدفع'
    case 'requires_action':
      return 'بانتظار إتمام الدفع'
    case 'failed':
      return 'فشل الدفع'
    case 'cancelled':
      return 'تم إلغاء الدفع'
    case 'expired':
      return 'انتهت صلاحية جلسة الدفع'
    case 'refunded':
      return 'تم استرداد المبلغ'
    case 'partially_refunded':
      return 'تم استرداد جزء من المبلغ'
    default:
      return 'حالة الدفع غير مؤكدة'
  }
}
