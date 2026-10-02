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

/**
 * Creates a guest order through the secure create_guest_order RPC.
 * Server snapshots product names/prices and rejects inactive/out-of-stock items.
 */
export async function createOrder(payload: CheckoutPayload, items: CartItem[]) {
  if (!items.length) {
    throw new AppError('validation', 'السلة فارغة.')
  }

  if (!isSupabaseConfigured) {
    return {
      id: `local-${Date.now()}`,
      mode: 'local-placeholder' as const,
    }
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

    if (error) throw error

    return {
      id: data as string,
      mode: 'supabase' as const,
    }
  } catch (error) {
    throw toAppError(error, 'تعذر إنشاء الطلب')
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
