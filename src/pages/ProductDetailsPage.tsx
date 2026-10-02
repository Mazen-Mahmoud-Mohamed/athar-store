import { Link, useParams } from 'react-router-dom'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/features/products/ProductCard'
import { useCart } from '@/features/cart/cart-context'
import { getErrorMessage } from '@/lib/errors'
import { calcDiscountPercent, formatPrice } from '@/lib/utils'
import { getProductsByCategory, getProductById } from '@/services/productService'
import type { Product } from '@/types'

export function ProductDetailsPage() {
  const { id } = useParams()
  const { addItem } = useCart()
  const [qty, setQty] = useState(1)
  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!id) return
      setLoading(true)
      setNotFound(false)
      setQty(1)
      try {
        const found = await getProductById(id)
        if (!active) return
        setProduct(found)
        if (!found) {
          setRelated([])
          setNotFound(true)
          setError(null)
          return
        }
        if (found.category_id) {
          const siblings = await getProductsByCategory(found.category_id)
          if (!active) return
          setRelated(siblings.filter((p) => p.id !== found.id).slice(0, 4))
        } else {
          setRelated([])
        }
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل المنتج'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id])

  if (loading) {
    return (
      <div className="container-athar py-16 text-center text-sm text-mocha">جاري التحميل...</div>
    )
  }

  if (error) {
    return (
      <div className="container-athar py-16 text-center text-sm text-danger">{error}</div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="container-athar py-16 text-center">
        <p className="font-display text-xl text-brown">المنتج غير متوفر</p>
        <p className="mt-2 text-sm text-mocha">قد يكون المنتج غير نشط أو غير موجود.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/products">العودة للمنتجات</Link>
        </Button>
      </div>
    )
  }

  const discount = calcDiscountPercent(product.price, product.old_price)
  const outOfStock = product.stock_quantity <= 0

  return (
    <>
      <PageMeta title={product.name} description={product.description ?? product.name} />
      <div className="container-athar py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="overflow-hidden rounded-xl bg-mist">
            <div className="aspect-[4/5] bg-gradient-to-br from-mist via-ivory to-sand/80">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                  <span className="font-display text-5xl font-semibold text-brown/20">أثر</span>
                  <span className="text-xs tracking-[0.25em] text-mocha/40">BAGS</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {product.category ? (
              <Link
                to={`/category/${product.category.slug}`}
                className="text-xs tracking-wide text-mocha hover:text-brown"
              >
                {product.category.name}
              </Link>
            ) : null}

            <h1 className="font-display text-3xl font-semibold leading-snug sm:text-4xl">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold text-brown">{formatPrice(product.price)}</p>
              {product.old_price ? (
                <p className="text-base text-mocha line-through">{formatPrice(product.old_price)}</p>
              ) : null}
              {discount ? <Badge variant="gold">خصم {discount}%</Badge> : null}
              {product.is_new ? <Badge variant="soft">جديد</Badge> : null}
            </div>

            {product.description ? (
              <p className="text-sm leading-8 text-mocha sm:text-base">{product.description}</p>
            ) : null}

            <p className="text-sm text-mocha">
              التوفر:{' '}
              <span className={outOfStock ? 'text-danger' : 'text-success'}>
                {outOfStock ? 'غير متوفر حالياً' : `متوفر (${product.stock_quantity})`}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="inline-flex items-center rounded-md border border-taupe/50 bg-card">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="تقليل الكمية"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Minus />
                </Button>
                <span className="min-w-10 text-center text-sm font-medium" aria-live="polite">
                  {qty}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="زيادة الكمية"
                  onClick={() =>
                    setQty((q) => Math.min(Math.max(product.stock_quantity, 1), q + 1))
                  }
                >
                  <Plus />
                </Button>
              </div>

              <Button
                size="lg"
                className="min-w-44 flex-1 sm:flex-none"
                disabled={outOfStock}
                onClick={() =>
                  addItem(
                    {
                      productId: product.id,
                      name: product.name,
                      price: product.price,
                      imageUrl: product.image_url,
                      slug: product.slug,
                    },
                    qty,
                  )
                }
              >
                <ShoppingBag />
                أضيفي إلى السلة
              </Button>
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-16 sm:mt-20">
            <h2 className="mb-8 font-display text-2xl font-semibold">منتجات ذات صلة</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
