import type { CartItem } from '@/types'

const STORAGE_KEY = 'athar-buy-now-v1'
const MAX_AGE_MS = 1000 * 60 * 60 * 6 // 6 hours

export const BUY_NOW_QUERY = 'buy-now'

type BuyNowRecord = {
  item: CartItem
  createdAt: number
}

function isValidItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false
  const row = item as CartItem
  return (
    typeof row.productId === 'string' &&
    typeof row.name === 'string' &&
    typeof row.price === 'number' &&
    Number.isFinite(row.price) &&
    typeof row.quantity === 'number' &&
    Number.isFinite(row.quantity) &&
    row.quantity > 0 &&
    typeof row.slug === 'string' &&
    (row.imageUrl === null || typeof row.imageUrl === 'string')
  )
}

/** Persist a one-product checkout intent without touching the cart. */
export function setBuyNowIntent(item: CartItem): void {
  if (typeof window === 'undefined' || !isValidItem(item)) return
  const record: BuyNowRecord = {
    item: {
      productId: item.productId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
      quantity: Math.max(1, Math.floor(item.quantity)),
      slug: item.slug,
    },
    createdAt: Date.now(),
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private mode / quota — checkout will fall back gracefully.
  }
}

export function readBuyNowIntent(): CartItem | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BuyNowRecord
    if (!parsed || typeof parsed.createdAt !== 'number' || !isValidItem(parsed.item)) {
      clearBuyNowIntent()
      return null
    }
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      clearBuyNowIntent()
      return null
    }
    return parsed.item
  } catch {
    clearBuyNowIntent()
    return null
  }
}

export function writeBuyNowIntentItem(item: CartItem | null): void {
  if (!item) {
    clearBuyNowIntent()
    return
  }
  setBuyNowIntent(item)
}

export function clearBuyNowIntent(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function buyNowCheckoutPath(): string {
  return `/checkout?intent=${BUY_NOW_QUERY}`
}
