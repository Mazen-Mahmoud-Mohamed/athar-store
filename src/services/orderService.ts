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

export type AdminOrderListItem = Order & {
  item_count: number
  reference: string
}

export type AdminOrderDetailItem = OrderItem & {
  /** Current catalog image only — never used for price/name. */
  image_url: string | null
}

export type AdminOrderDetail = Omit<Order, 'items'> & {
  reference: string
  items: AdminOrderDetailItem[]
}

export type AdminOrdersQuery = {
  status?: OrderStatus | 'all'
  search?: string
  page?: number
  pageSize?: number
}

export type AdminOrdersResult = {
  orders: AdminOrderListItem[]
  total: number
  page: number
  pageSize: number
}

export type AdminOrderCounts = {
  total: number
  pending: number
  confirmed: number
  preparing: number
  shipped: number
  delivered: number
  cancelled: number
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

function escapeIlike(value: string) {
  return value.replace(/[%_,]/g, '')
}

function parseReferenceHex(search: string): string | null {
  const trimmed = search.trim()
  const fromLabel = trimmed.match(/^أثر-([0-9a-fA-F]{4,8})$/)
  if (fromLabel) return fromLabel[1].toLowerCase()
  if (/^[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}$/.test(trimmed)) {
    return trimmed.replace(/-/g, '').slice(0, 8).toLowerCase()
  }
  return null
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

/** @deprecated Prefer adminListOrders for paginated admin list. */
export async function adminGetOrders(): Promise<Order[]> {
  const page = await adminListOrders({ page: 1, pageSize: 100 })
  return page.orders
}

export async function adminListOrders(
  query: AdminOrdersQuery = {},
): Promise<AdminOrdersResult> {
  if (!isSupabaseConfigured) {
    return { orders: [], total: 0, page: 1, pageSize: query.pageSize ?? 20 }
  }

  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const status = query.status && query.status !== 'all' ? query.status : null
  const search = query.search?.trim() ?? ''
  const refHex = search ? parseReferenceHex(search) : null

  try {
    const supabase = requireSupabase()

    // Reference search: scan a bounded newest window, then paginate in memory.
    if (refHex) {
      let refQuery = supabase
        .from('orders')
        .select('*, order_items(count)')
        .order('created_at', { ascending: false })
        .limit(300)

      if (status) refQuery = refQuery.eq('status', status)

      const { data, error } = await refQuery
      if (error) throw error

      const matched = (data ?? [])
        .map((row) => mapListRow(row))
        .filter((order) => order.id.replace(/-/g, '').toLowerCase().startsWith(refHex))

      const slice = matched.slice(from, from + pageSize)
      return {
        orders: slice,
        total: matched.length,
        page,
        pageSize,
      }
    }

    let listQuery = supabase
      .from('orders')
      .select('*, order_items(count)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status) listQuery = listQuery.eq('status', status)

    if (search) {
      const escaped = escapeIlike(search)
      if (escaped) {
        listQuery = listQuery.or(
          `customer_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
        )
      }
    }

    const { data, error, count } = await listQuery
    if (error) throw error

    return {
      orders: (data ?? []).map((row) => mapListRow(row)),
      total: count ?? 0,
      page,
      pageSize,
    }
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل الطلبات.')
  }
}

function mapListRow(row: unknown): AdminOrderListItem {
  const raw = row as Order & { order_items?: Array<{ count: number }> | null }
  const itemCount = Array.isArray(raw.order_items) ? Number(raw.order_items[0]?.count ?? 0) : 0
  const { order_items: _ignored, ...order } = raw
  void _ignored
  return {
    ...mapOrder(order as Order),
    item_count: itemCount,
    reference: formatOrderReference(raw.id),
  }
}

export async function adminGetOrderCounts(): Promise<AdminOrderCounts> {
  if (!isSupabaseConfigured) {
    return {
      total: 0,
      pending: 0,
      confirmed: 0,
      preparing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    }
  }

  try {
    const supabase = requireSupabase()
    const statusKeys: OrderStatus[] = [
      'pending',
      'confirmed',
      'preparing',
      'shipped',
      'delivered',
      'cancelled',
    ]

    const totalReq = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })

    const statusReqs = statusKeys.map((status) =>
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', status),
    )

    const [totalRes, ...statusResults] = await Promise.all([totalReq, ...statusReqs])

    if (totalRes.error) throw totalRes.error
    for (const res of statusResults) {
      if (res.error) throw res.error
    }

    const counts: AdminOrderCounts = {
      total: totalRes.count ?? 0,
      pending: 0,
      confirmed: 0,
      preparing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    }

    statusKeys.forEach((status, index) => {
      counts[status] = statusResults[index]?.count ?? 0
    })

    return counts
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل ملخص الطلبات.')
  }
}

export async function adminGetOrderById(id: string): Promise<AdminOrderDetail | null> {
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

    // Snapshot fields come from order_items. Product join is image-only.
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*, product:products(image_url)')
      .eq('order_id', id)
      .order('id', { ascending: true })

    if (itemsError) throw itemsError

    const mappedItems: AdminOrderDetailItem[] = (items ?? []).map((row) => {
      const raw = row as OrderItem & {
        product?: { image_url: string | null } | null
      }
      const { product, ...item } = raw
      return {
        ...mapOrderItem(item),
        image_url: product?.image_url ?? null,
      }
    })

    return {
      ...mapOrder(order as Order),
      reference: formatOrderReference((order as Order).id),
      items: mappedItems,
    }
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل تفاصيل الطلب.')
  }
}

export async function adminUpdateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<AdminOrderDetail> {
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

    const detailed = await adminGetOrderById(id)
    if (!detailed) {
      return {
        ...mapOrder(data as Order),
        reference: formatOrderReference((data as Order).id),
        items: [],
      }
    }
    return detailed
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث حالة الطلب.')
  }
}
