import { AppError } from '@/lib/errors'
import { slugifyArabic } from '@/lib/utils'

/** Slug: trimmed, URL-safe Latin/Arabic segments separated by single hyphens. */
const SLUG_PATTERN = /^[\u0600-\u06FFa-z0-9]+(?:-[\u0600-\u06FFa-z0-9]+)*$/i

export function normalizeSlug(value: string) {
  return value.trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function isValidSlug(value: string) {
  const slug = normalizeSlug(value)
  return slug.length > 0 && slug.length <= 120 && SLUG_PATTERN.test(slug)
}

export function requireValidSlug(value: string, label = 'المعرّف (Slug)') {
  const slug = normalizeSlug(value)
  if (!slug) {
    throw new AppError('validation', `${label} مطلوب.`)
  }
  if (!isValidSlug(slug)) {
    throw new AppError(
      'validation',
      `${label} غير صالح. استخدمي أحرفاً وأرقاماً وشرطات فقط دون مسافات.`,
    )
  }
  return slug.toLowerCase()
}

export function slugFromName(name: string) {
  const generated = normalizeSlug(slugifyArabic(name))
  if (!generated || !isValidSlug(generated)) {
    throw new AppError(
      'validation',
      'تعذر إنشاء المعرّف من الاسم. أدخلي Slug يدوياً بحروف وأرقام وشرطات.',
    )
  }
  return generated.toLowerCase()
}

export function requireNonEmptyName(value: string, label = 'الاسم') {
  const name = value.trim()
  if (!name) {
    throw new AppError('validation', `${label} مطلوب.`)
  }
  return name
}

export function parseMoney(value: unknown, label: string, { required = true } = {}) {
  if (value === '' || value == null) {
    if (required) throw new AppError('validation', `${label} مطلوب.`)
    return null
  }

  const amount = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(amount)) {
    throw new AppError('validation', `${label} يجب أن يكون رقماً صالحاً.`)
  }
  if (amount < 0) {
    throw new AppError('validation', `${label} لا يمكن أن يكون سالباً.`)
  }

  // Keep two decimal places to match numeric(10,2) without float noise.
  return Math.round(amount * 100) / 100
}

export function validateProductPricing(price: number, oldPrice: number | null) {
  if (price < 0) {
    throw new AppError('validation', 'السعر لا يمكن أن يكون سالباً.')
  }
  if (oldPrice != null && oldPrice < price) {
    throw new AppError('validation', 'السعر السابق يجب أن يكون أكبر من أو يساوي السعر الحالي.')
  }
}

export function parseStockQuantity(value: unknown) {
  const stock = value === '' || value == null ? 0 : Number(value)
  if (!Number.isInteger(stock) || stock < 0) {
    throw new AppError('validation', 'كمية المخزون يجب أن تكون عدداً صحيحاً غير سالب.')
  }
  return stock
}
