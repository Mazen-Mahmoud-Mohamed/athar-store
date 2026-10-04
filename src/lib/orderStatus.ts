import type { OrderStatus } from '@/types'

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'جديد',
  confirmed: 'تم التأكيد',
  preparing: 'جاري التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

/** Action-oriented labels for status transition buttons. */
export const ORDER_STATUS_ACTION_LABELS: Record<OrderStatus, string> = {
  pending: 'جديد',
  confirmed: 'تأكيد الطلب',
  preparing: 'بدء التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'إلغاء الطلب',
}

const FLOW: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered']

export function isTerminalOrderStatus(status: OrderStatus) {
  return status === 'delivered' || status === 'cancelled'
}

/** UI-level workflow: next step in the preferred flow, plus cancel when not delivered. */
export function getAllowedStatusTransitions(current: OrderStatus): OrderStatus[] {
  if (isTerminalOrderStatus(current)) return []

  const allowed: OrderStatus[] = []
  const idx = FLOW.indexOf(current)
  if (idx >= 0 && idx < FLOW.length - 1) {
    allowed.push(FLOW[idx + 1])
  }
  allowed.push('cancelled')
  return allowed
}

export function orderStatusBadgeVariant(
  status: OrderStatus,
): 'default' | 'gold' | 'soft' | 'outline' | 'danger' {
  switch (status) {
    case 'pending':
      return 'soft'
    case 'confirmed':
      return 'outline'
    case 'preparing':
      return 'gold'
    case 'shipped':
      return 'default'
    case 'delivered':
      return 'outline'
    case 'cancelled':
      return 'danger'
    default:
      return 'soft'
  }
}

/** Build wa.me URL from a customer phone for admin-only contact actions. */
export function customerWhatsAppUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null

  let international = digits
  if (digits.startsWith('0') && digits.length >= 10) {
    international = `20${digits.slice(1)}`
  } else if (digits.startsWith('20')) {
    international = digits
  } else if (digits.length === 10 && digits.startsWith('1')) {
    international = `20${digits}`
  }

  if (international.length < 11) return null
  return `https://wa.me/${international}`
}

export function formatAdminDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export function formatAdminDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}
