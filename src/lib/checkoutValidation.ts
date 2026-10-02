import type { CheckoutPayload } from '@/types'

export type CheckoutFieldErrors = Partial<
  Record<'customerName' | 'phone' | 'address' | 'notes', string>
>

/** Normalize Egyptian mobile numbers to 01XXXXXXXXX when possible. */
export function normalizeEgyptianPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '').trim()

  if (digits.startsWith('+20')) {
    const rest = digits.slice(3)
    if (rest.startsWith('1') && rest.length === 10) return `0${rest}`
  }

  if (digits.startsWith('20') && digits.length === 12) {
    const rest = digits.slice(2)
    if (rest.startsWith('1')) return `0${rest}`
  }

  if (digits.startsWith('01') && digits.length === 11) return digits

  return digits.replace(/\D/g, '')
}

export function isValidEgyptianPhone(raw: string): boolean {
  const normalized = normalizeEgyptianPhone(raw)
  return /^01[0125]\d{8}$/.test(normalized)
}

export function validateCheckoutPayload(input: {
  customerName: string
  phone: string
  address: string
  notes?: string
}): { ok: true; payload: CheckoutPayload } | { ok: false; errors: CheckoutFieldErrors } {
  const errors: CheckoutFieldErrors = {}

  const customerName = input.customerName.trim().replace(/\s+/g, ' ')
  const phoneRaw = input.phone.trim()
  const address = input.address.trim().replace(/\s+/g, ' ')
  const notes = input.notes?.trim() ?? ''

  if (!customerName) {
    errors.customerName = 'الاسم مطلوب.'
  } else if (customerName.length < 3) {
    errors.customerName = 'من فضلك أدخلي الاسم بالكامل.'
  } else if (customerName.length > 80) {
    errors.customerName = 'الاسم طويل جداً.'
  }

  if (!phoneRaw) {
    errors.phone = 'رقم الهاتف مطلوب.'
  } else if (!isValidEgyptianPhone(phoneRaw)) {
    errors.phone = 'أدخلي رقم هاتف مصري صحيح (مثال: 01xxxxxxxxx).'
  }

  if (!address) {
    errors.address = 'العنوان مطلوب.'
  } else if (address.length < 10) {
    errors.address = 'من فضلك أدخلي العنوان بالتفصيل.'
  } else if (address.length > 300) {
    errors.address = 'العنوان طويل جداً.'
  }

  if (notes.length > 500) {
    errors.notes = 'الملاحظات يجب ألا تتجاوز 500 حرف.'
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    payload: {
      customerName,
      phone: normalizeEgyptianPhone(phoneRaw),
      address,
      ...(notes ? { notes } : {}),
    },
  }
}

export function formatOrderReference(orderId: string): string {
  const compact = orderId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `أثر-${compact}`
}
