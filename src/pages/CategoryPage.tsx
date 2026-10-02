import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/features/products/ProductCard'
import { getErrorMessage } from '@/lib/errors'
import { getCategoryBySlug } from '@/services/categoryService'
import { getProductsByCategory } from '@/services/productService'
import type { Category, Product } from '@/types'

export function CategoryPage() {
  const { slug } = useParams()
  const [category, setCategory] = useState<Category | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!slug) return
      setLoading(true)
      setNotFound(false)
      try {
        const found = await getCategoryBySlug(slug)
        if (!active) return
        setCategory(found)
        if (!found) {
          setProducts([])
          setNotFound(true)
          setError(null)
          return
        }
        const list = await getProductsByCategory(found.id)
        if (!active) return
        setProducts(list)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل التصنيف'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [slug])

  return (
    <>
      <PageMeta
        title={category?.name ?? 'التصنيف'}
        description={category?.description ?? category?.name}
      />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">التصنيف</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            {loading ? '...' : category?.name ?? 'التصنيف'}
          </h1>
          {category?.description ? (
            <p className="mt-3 text-sm leading-7 text-mocha">{category.description}</p>
          ) : null}
        </div>

        {error ? <p className="mb-6 text-sm text-danger">{error}</p> : null}

        {loading ? (
          <p className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center text-mocha">
            جاري التحميل...
          </p>
        ) : notFound ? (
          <div className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center">
            <p className="font-display text-lg text-brown">التصنيف غير موجود</p>
            <p className="mt-2 text-sm text-mocha">ربما تم إيقافه أو لم يعد متاحاً.</p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/products">العودة للمنتجات</Link>
            </Button>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center text-mocha">
            لا توجد منتجات نشطة في هذا التصنيف حالياً.
          </p>
        )}
      </div>
    </>
  )
}
