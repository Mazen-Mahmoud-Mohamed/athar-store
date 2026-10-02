import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useCart } from '@/features/cart/cart-context'
import { formatPrice } from '@/lib/utils'

export function CartPage() {
  const { items, itemCount, subtotal, total, updateQuantity, removeItem, clearCart } = useCart()

  return (
    <>
      <PageMeta title="سلة التسوق" description="راجعي مشترياتك في أثر قبل إتمام الطلب." />
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
          <div className="rounded-xl border border-dashed border-taupe/50 bg-card px-6 py-16 text-center">
            <p className="font-display text-xl text-brown">سلتك فارغة حالياً</p>
            <p className="mt-2 text-sm text-mocha">ابدئي باختيار قطعة تترك أثراً.</p>
            <Button asChild className="mt-6">
              <Link to="/products">تسوقي المنتجات</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-4 rounded-xl border border-taupe/30 bg-card p-4"
                >
                  <div className="size-24 shrink-0 overflow-hidden rounded-md bg-mist">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-brown/25">
                        أثر
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`/products/${item.productId}`}
                          className="font-display text-base font-semibold hover:text-espresso"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-1 text-sm text-mocha">{formatPrice(item.price)}</p>
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
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="زيادة الكمية"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="h-fit rounded-xl border border-taupe/30 bg-card p-6">
              <h2 className="font-display text-lg font-semibold">ملخص الطلب</h2>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-mocha">المجموع الفرعي</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>الإجمالي</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
              <Button asChild className="mt-6 w-full" size="lg">
                <Link to="/checkout">إتمام الطلب</Link>
              </Button>
            </aside>
          </div>
        )}
      </div>
    </>
  )
}
