import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { ProductCard } from '@/features/products/ProductCard'
import { getErrorMessage } from '@/lib/errors'
import { getCategoryBySlug } from '@/services/categoryService'
import { getProductsByCategory } from '@/services/productService'
import type { Category, Product } from '@/types'

export function CategoryPage() {
  const { slug } = useParams()
  const [category, setCategory] = useState<Category | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!slug) return
      try {
        const found = await getCategoryBySlug(slug)
        if (!active) return
        setCategory(found)
        if (found) {
          const list = await getProductsByCategory(found.id)
          if (!active) return
          setProducts(list)
        } else {
          setProducts([])
        }
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل التصنيف'))
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
            {category?.name ?? 'التصنيف'}
          </h1>
          {category?.description ? (
            <p className="mt-3 text-sm leading-7 text-mocha">{category.description}</p>
          ) : null}
        </div>
        {error ? <p className="mb-6 text-sm text-danger">{error}</p> : null}
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center text-mocha">
            لا توجد منتجات في هذا التصنيف حالياً.
          </p>
        )}
      </div>
    </>
  )
}
