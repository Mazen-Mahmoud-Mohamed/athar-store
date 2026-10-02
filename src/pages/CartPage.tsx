import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CatalogEmpty } from '@/features/catalog/CatalogStates'
import { useCart } from '@/features/cart/cart-context'
import { formatPrice } from '@/lib/utils'
import { getProductById } from '@/services/productService'

type LineStatus = {
  available: boolean
  inactive: boolean
  outOfStock: boolean
  priceChanged: boolean
  livePrice: number | null
  maxStock: number
  checking: boolean
}

const defaultStatus = (): LineStatus => ({
  available: true,
  inactive: false,
  outOfStock: false,
  priceChanged: false,
  livePrice: null,
  maxStock: 99,
  checking: true,
})

export function CartPage() {
  const { items, itemCount, subtotal, updateQuantity, removeItem, clearCart, syncItem } =
    useCart()
  const [statuses, setStatuses] = useState<Record<string, LineStatus>>({})

  useEffect(() => {
    let active = true

    async function validate() {
      if (items.length === 0) {
        setStatuses({})
        return
      }

      setStatuses((prev) => {
        const next: Record<string, LineStatus> = {}
        for (const item of items) {
          next[item.productId] = { ...(prev[item.productId] ?? defaultStatus()), checking: true }
        }
        return next
      })

      const entries = await Promise.all(
        items.map(async (item) => {
          try {
            const product = await getProductById(item.productId)
            if (!product) {
              return [
                item.productId,
                {
                  available: false,
                  inactive: true,
                  outOfStock: false,
                  priceChanged: false,
                  livePrice: null,
                  maxStock: 0,
                  checking: false,
                } satisfies LineStatus,
              ] as const
            }

            const priceChanged = product.price !== item.price
            if (
              priceChanged ||
              product.name !== item.name ||
              product.image_url !== item.imageUrl
            ) {
              syncItem(item.productId, {
                price: product.price,
                name: product.name,
                imageUrl: product.image_url,
                slug: product.slug,
              })
            }

            if (item.quantity > product.stock_quantity && product.stock_quantity > 0) {
              updateQuantity(item.productId, product.stock_quantity)
            }

            const outOfStock = product.stock_quantity <= 0
            return [
              item.productId,
              {
                available: !outOfStock,
                inactive: false,
                outOfStock,
                priceChanged,
                livePrice: product.price,
                maxStock: product.stock_quantity,
                checking: false,
              } satisfies LineStatus,
            ] as const
          } catch {
            return [
              item.productId,
              {
                available: false,
                inactive: true,
                outOfStock: false,
                priceChanged: false,
                livePrice: null,
                maxStock: 0,
                checking: false,
              } satisfies LineStatus,
            ] as const
          }
        }),
      )

      if (!active) return
      setStatuses(Object.fromEntries(entries))
    }

    void validate()
    return () => {
      active = false
    }
    // Intentionally depend on product ids + quantities only to avoid loops from syncItem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.productId}:${i.quantity}`).join('|')])

  const hasBlockingIssues = useMemo(
    () =>
      items.some((item) => {
        const status = statuses[item.productId]
        if (!status || status.checking) return true
        return !status.available || status.inactive
      }),
    [items, statuses],
  )

  const liveSubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const status = statuses[item.productId]
      if (status?.inactive || status?.outOfStock) return sum
      const price = status?.livePrice ?? item.price
      return sum + price * item.quantity
    }, 0)
  }, [items, statuses])

  return (
    <>
      <PageMeta
        title="سلة التسوق"
        description="راجعي مشترياتك في أثر قبل إتمام الطلب."
        path="/cart"
        noIndex
      />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">السلة</p>
            <h1 className="font-display text-3xl font-semibold">سلة التسوق</h1>
            <p className="mt-2 text-sm text-mocha">{itemCount} منتج</p>
          </div>
          {items.length > 0 ? (
            <Button variant="ghost" onClick={clearCart}>
              تفريغ السلة
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <CatalogEmpty
            title="سلتك فارغة حالياً"
            description="ابدئي باختيار قطعة تترك أثراً."
            actionLabel="تسوقي المنتجات"
            actionTo="/products"
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <ul className="space-y-4">
              {items.map((item) => {
                const status = statuses[item.productId]
                const blocked = Boolean(status && !status.checking && !status.available)

                return (
                  <li
                    key={item.productId}
                    className="flex flex-col gap-4 rounded-xl border border-taupe/30 bg-card p-4 sm:flex-row"
                  >
                    <div className="size-28 shrink-0 overflow-hidden rounded-md bg-mist sm:size-24">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-display text-brown/25">
                          أثر
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/products/${item.productId}`}
                            className="font-display text-base font-semibold hover:text-espresso"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-1 text-sm text-mocha">
                            {formatPrice(status?.livePrice ?? item.price)}
                          </p>
                          {status?.priceChanged ? (
                            <p className="mt-1 text-xs text-gold-deep">
                              تم تحديث السعر إلى السعر الحالي في المتجر.
                            </p>
                          ) : null}
                          {status?.inactive ? (
                            <p className="mt-1 text-xs text-danger">
                              هذا المنتج لم يعد متاحاً في المتجر. يُرجى حذفه قبل المتابعة.
                            </p>
                          ) : null}
                          {status?.outOfStock ? (
                            <p className="mt-1 text-xs text-danger">
                              نفد المخزون حالياً — لا يمكن إتمام الطلب بهذا المنتج.
                            </p>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`حذف ${item.name}`}
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="inline-flex w-fit items-center rounded-md border border-taupe/50">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="تقليل الكمية"
                          disabled={blocked}
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        >
                          <Minus />
                        </Button>
                        <span className="min-w-8 text-center text-sm" aria-live="polite">
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="زيادة الكمية"
                          disabled={
                            blocked ||
                            Boolean(status && item.quantity >= status.maxStock)
                          }
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <aside className="h-fit rounded-xl border border-taupe/30 bg-card p-6">
              <h2 className="font-display text-lg font-semibold">ملخص الطلب</h2>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-mocha">المجموع الفرعي</span>
                  <span>{formatPrice(liveSubtotal || subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>الإجمالي</span>
                  <span>{formatPrice(liveSubtotal || subtotal)}</span>
                </div>
              </div>
              {hasBlockingIssues ? (
                <p className="mt-4 text-xs leading-6 text-danger">
                  تحتوي سلتك على منتجات غير متاحة أو قيد التحقق. أصلحي السلة قبل المتابعة لاحقاً.
                </p>
              ) : null}
              {hasBlockingIssues ? (
                <Button className="mt-6 w-full" size="lg" disabled>
                  إتمام الطلب غير متاح حالياً
                </Button>
              ) : (
                <Button asChild className="mt-6 w-full" size="lg">
                  <Link to="/checkout">إتمام الطلب</Link>
                </Button>
              )}
              <p className="mt-3 text-center text-xs text-mocha">
                الدفع عند الاستلام — يتم تأكيد الطلب بعد المراجعة.
              </p>
            </aside>
          </div>
        )}
      </div>
    </>
  )
}
