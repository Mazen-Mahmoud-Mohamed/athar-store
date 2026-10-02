import { getProductById } from '@/services/productService'
import type { CartItem } from '@/types'

export type CartLineIssue =
  | 'inactive'
  | 'out_of_stock'
  | 'insufficient_stock'
  | 'price_changed'

export type CartValidationLine = {
  productId: string
  issue?: CartLineIssue
  message?: string
  livePrice?: number
  maxStock?: number
  name?: string
  imageUrl?: string | null
  slug?: string
}

export type CartValidationResult = {
  ok: boolean
  lines: CartValidationLine[]
  syncedItems: CartItem[]
  messages: string[]
}

/**
 * Refresh cart lines against the live active catalog before checkout.
 * Syncs names/prices/images; never trusts stale client prices for submission.
 */
export async function validateCartForCheckout(items: CartItem[]): Promise<CartValidationResult> {
  if (items.length === 0) {
    return {
      ok: false,
      lines: [],
      syncedItems: [],
      messages: ['السلة فارغة.'],
    }
  }

  const lines: CartValidationLine[] = []
  const syncedItems: CartItem[] = []
  const messages: string[] = []

  for (const item of items) {
    try {
      const product = await getProductById(item.productId)
      if (!product) {
        const line: CartValidationLine = {
          productId: item.productId,
          issue: 'inactive',
          message: `"${item.name}" لم يعد متاحاً في المتجر.`,
        }
        lines.push(line)
        messages.push(line.message!)
        continue
      }

      if (product.stock_quantity <= 0) {
        const line: CartValidationLine = {
          productId: item.productId,
          issue: 'out_of_stock',
          message: `"${product.name}" نفد مخزونه حالياً.`,
          livePrice: product.price,
          maxStock: 0,
          name: product.name,
          imageUrl: product.image_url,
          slug: product.slug,
        }
        lines.push(line)
        messages.push(line.message!)
        syncedItems.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.image_url,
          quantity: item.quantity,
          slug: product.slug,
        })
        continue
      }

      if (item.quantity > product.stock_quantity) {
        const line: CartValidationLine = {
          productId: item.productId,
          issue: 'insufficient_stock',
          message: `الكمية المطلوبة من "${product.name}" غير متوفرة (المتاح: ${product.stock_quantity}).`,
          livePrice: product.price,
          maxStock: product.stock_quantity,
          name: product.name,
          imageUrl: product.image_url,
          slug: product.slug,
        }
        lines.push(line)
        messages.push(line.message!)
        syncedItems.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.image_url,
          quantity: product.stock_quantity,
          slug: product.slug,
        })
        continue
      }

      const priceChanged = product.price !== item.price
      if (priceChanged) {
        const line: CartValidationLine = {
          productId: item.productId,
          issue: 'price_changed',
          message: `تم تحديث سعر "${product.name}". راجعي الإجمالي قبل التأكيد.`,
          livePrice: product.price,
          maxStock: product.stock_quantity,
          name: product.name,
          imageUrl: product.image_url,
          slug: product.slug,
        }
        lines.push(line)
        messages.push(line.message!)
      } else {
        lines.push({
          productId: item.productId,
          livePrice: product.price,
          maxStock: product.stock_quantity,
          name: product.name,
          imageUrl: product.image_url,
          slug: product.slug,
        })
      }

      syncedItems.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.image_url,
        quantity: item.quantity,
        slug: product.slug,
      })
    } catch {
      const line: CartValidationLine = {
        productId: item.productId,
        issue: 'inactive',
        message: `تعذر التحقق من "${item.name}". حاولي مرة أخرى.`,
      }
      lines.push(line)
      messages.push(line.message!)
    }
  }

  const blocking = lines.some(
    (line) =>
      line.issue === 'inactive' ||
      line.issue === 'out_of_stock' ||
      line.issue === 'insufficient_stock' ||
      line.issue === 'price_changed',
  )

  return {
    ok: !blocking && syncedItems.length === items.length,
    lines,
    syncedItems,
    messages,
  }
}
