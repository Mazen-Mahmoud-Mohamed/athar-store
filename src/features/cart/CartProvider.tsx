import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CartContext, type CartContextValue } from '@/features/cart/cart-context'
import type { CartItem } from '@/types'
import { toast } from 'sonner'

const STORAGE_KEY = 'athar-cart-v1'

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartItem[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.productId === 'string' &&
        typeof item.name === 'string' &&
        typeof item.price === 'number' &&
        typeof item.quantity === 'number' &&
        item.quantity > 0,
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setItems(readCart())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items, hydrated])

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

    return {
      items,
      itemCount,
      subtotal,
      total: subtotal,
      addItem: (item, quantity = 1) => {
        const qty = Math.max(1, Math.floor(quantity))
        setItems((prev) => {
          const existing = prev.find((p) => p.productId === item.productId)
          if (existing) {
            return prev.map((p) =>
              p.productId === item.productId
                ? {
                    ...p,
                    ...item,
                    quantity: p.quantity + qty,
                  }
                : p,
            )
          }
          return [...prev, { ...item, quantity: qty }]
        })
        toast.success('تمت الإضافة إلى السلة')
      },
      removeItem: (productId) => {
        setItems((prev) => prev.filter((p) => p.productId !== productId))
        toast.message('تم حذف المنتج من السلة')
      },
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          setItems((prev) => prev.filter((p) => p.productId !== productId))
          return
        }
        setItems((prev) =>
          prev.map((p) =>
            p.productId === productId ? { ...p, quantity: Math.floor(quantity) } : p,
          ),
        )
      },
      syncItem: (productId, patch) => {
        setItems((prev) =>
          prev.map((p) => (p.productId === productId ? { ...p, ...patch } : p)),
        )
      },
      replaceItems: (next) => {
        setItems(
          next.filter(
            (item) =>
              item &&
              typeof item.productId === 'string' &&
              typeof item.quantity === 'number' &&
              item.quantity > 0,
          ),
        )
      },
      clearCart: () => setItems([]),
    }
  }, [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
