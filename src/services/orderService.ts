import { formatOrderReference } from '@/lib/checkoutValidation'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import type { CartItem, CheckoutPayload, Order, OrderItem, OrderStatus } from '@/types'

function mapMoney(value: number | string) {
  return Number(value)
}

function mapOrder(row: Order): Order {
  return {
    ...row,
    subtotal: mapMoney(row.subtotal),
    total: mapMoney(row.total),
    items: row.items?.map(mapOrderItem),
  }
}

function mapOrderItem(row: OrderItem): OrderItem {
  return {
    ...row,
    unit_price: mapMoney(row.unit_price),
    subtotal: mapMoney(row.subtotal),
  }
}

export type GuestOrderConfirmation = {
  id: string
  reference: string
  status: 'pending'
  customerName: string
  subtotal: number
  total: number
  items: Array<{
    productId?: string
    productName: string
    unitPrice: number
    quantity: number
    subtotal: number
  }>
}

function mapOrderRpcError(error: unknown): AppError | null {
  if (!error || typeof error !== 'object') return null
  const message = String((error as { message?: string }).message ?? '')

  if (/PRODUCT_UNAVAILABLE|Product unavailable/i.test(message)) {
    return new AppError('validation', 'أحد المنتجات لم يعد متاحًا.', { cause: error })
  }
  if (/INSUFFICIENT_STOCK|Insufficient stock/i.test(message)) {
    return new AppError('validation', 'الكمية المطلوبة غير متوفرة حاليًا.', { cause: error })
  }
  if (/ORDER_EMPTY|at least one item/i.test(message)) {
    return new AppError('validation', 'السلة فارغة.', { cause: error })
  }
  if (/CUSTOMER_NAME_REQUIRED|Customer name/i.test(message)) {
    return new AppError('validation', 'من فضلك تأكدي من بيانات الطلب.', { cause: error })
  }
  if (/PHONE_REQUIRED|Phone is required/i.test(message)) {
    return new AppError('validation', 'من فضلك تأكدي من بيانات الطلب.', { cause: error })
  }
  if (/ADDRESS_REQUIRED|Address is required/i.test(message)) {
    return new AppError('validation', 'من فضلك تأكدي من بيانات الطلب.', { cause: error })
  }
  if (/NOTES_TOO_LONG|INVALID_QUANTITY|PRODUCT_ID_REQUIRED/i.test(message)) {
    return new AppError('validation', 'من فضلك تأكدي من بيانات الطلب.', { cause: error })
  }

  return null
}

function parseConfirmation(
  data: unknown,
  fallback?: { customerName: string; items: CartItem[] },
): GuestOrderConfirmation {
  // Pre-004 RPC returns uuid only. Post-004 returns a confirmation jsonb.
  if (typeof data === 'string') {
    if (!fallback?.items.length) {
      throw new AppError('database', 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.')
    }
    const subtotal = fallback.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    )
    return {
      id: data,
      reference: formatOrderReference(data),
      status: 'pending',
      customerName: fallback.customerName,
      subtotal,
      total: subtotal,
      items: fallback.items.map((item) => ({
        productId: item.productId,
        productName: item.name,
        unitPrice: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
      })),
    }
  }

  if (!data || typeof data !== 'object') {
    throw new AppError('database', 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.')
  }

  const row = data as Record<string, unknown>
  const id = String(row.id ?? '')
  if (!id) {
    throw new AppError('database', 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.')
  }

  const rawItems = Array.isArray(row.items) ? row.items : []
  const items = rawItems.map((item) => {
    const line = item as Record<string, unknown>
    return {
      productId: line.product_id ? String(line.product_id) : undefined,
      productName: String(line.product_name ?? ''),
      unitPrice: mapMoney((line.unit_price as number | string) ?? 0),
      quantity: Number(line.quantity ?? 0),
      subtotal: mapMoney((line.subtotal as number | string) ?? 0),
    }
  })

  return {
    id,
    reference: formatOrderReference(id),
    status: 'pending',
    customerName: String(row.customer_name ?? fallback?.customerName ?? ''),
    subtotal: mapMoney((row.subtotal as number | string) ?? 0),
    total: mapMoney((row.total as number | string) ?? 0),
    items,
  }
}

/**
 * Creates a guest order through the secure create_guest_order RPC.
 * Sends only product IDs + quantities; server snapshots prices/names and totals.
 */
export async function createOrder(
  payload: CheckoutPayload,
  items: CartItem[],
): Promise<GuestOrderConfirmation> {
  if (!items.length) {
    throw new AppError('validation', 'السلة فارغة.')
  }

  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'تعذر إرسال الطلب حالياً. حاولي مرة أخرى لاحقاً.')
  }

  try {
    const supabase = requireSupabase()
    const rpcItems = items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }))

    const { data, error } = await supabase.rpc('create_guest_order', {
      p_customer_name: payload.customerName,
      p_phone: payload.phone,
      p_address: payload.address,
      p_notes: payload.notes ?? null,
      p_items: rpcItems,
    })

    if (error) {
      const mapped = mapOrderRpcError(error)
      if (mapped) throw mapped
      throw error
    }

    return parseConfirmation(data, {
      customerName: payload.customerName,
      items,
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    const mapped = mapOrderRpcError(error)
    if (mapped) throw mapped
    throw toAppError(error, 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.')
  }
}

export async function adminGetOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured) return []

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapOrder(row as Order))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل الطلبات')
  }
}

export async function adminGetOrderById(id: string): Promise<Order | null> {
  if (!isSupabaseConfigured) return null

  try {
    const supabase = requireSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!order) return null

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .order('id', { ascending: true })

    if (itemsError) throw itemsError

    return mapOrder({
      ...(order as Order),
      items: (items ?? []) as OrderItem[],
    })
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل تفاصيل الطلب')
  }
}

export async function adminUpdateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return mapOrder(data as Order)
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث حالة الطلب')
  }
}
