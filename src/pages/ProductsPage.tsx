import { useEffect, useState } from 'react'
import { PageMeta } from '@/components/seo/PageMeta'
import { ProductCard } from '@/features/products/ProductCard'
import { getErrorMessage } from '@/lib/errors'
import { getActiveProducts } from '@/services/productService'
import type { Product } from '@/types'

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getActiveProducts()
        if (!active) return
        setProducts(data)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل المنتجات'))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageMeta title="المنتجات" description="تسوّقي جميع منتجات أثر للحقائب والإكسسوارات." />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">المجموعة الكاملة</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">المنتجات</h1>
          <p className="mt-3 text-sm leading-7 text-mocha">
            اكتشفي قطع أثر المختارة بعناية — من الحقائب إلى الإكسسوارات.
          </p>
        </div>
        {error ? <p className="mb-6 text-sm text-danger">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </>
  )
}
