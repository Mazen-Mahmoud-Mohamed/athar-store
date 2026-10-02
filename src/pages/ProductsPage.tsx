import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/features/products/ProductCard'
import { getErrorMessage } from '@/lib/errors'
import { getActiveCategories } from '@/services/categoryService'
import { getActiveProducts, searchProducts } from '@/services/productService'
import type { Category, Product } from '@/types'

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const categorySlug = searchParams.get('category')?.trim() ?? ''

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [cats, list] = await Promise.all([
          getActiveCategories(),
          query ? searchProducts(query) : getActiveProducts(),
        ])
        if (!active) return
        setCategories(cats)
        setProducts(list)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل المنتجات'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [query])

  const filtered = useMemo(() => {
    if (!categorySlug) return products
    return products.filter((product) => product.category?.slug === categorySlug)
  }, [products, categorySlug])

  function setCategoryFilter(slug: string) {
    const next = new URLSearchParams(searchParams)
    if (slug) next.set('category', slug)
    else next.delete('category')
    setSearchParams(next)
  }

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
          {query ? (
            <p className="mt-2 text-sm text-mocha">
              نتائج البحث عن: <span className="font-medium text-brown">{query}</span>
            </p>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className="mb-8 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!categorySlug ? 'default' : 'outline'}
              onClick={() => setCategoryFilter('')}
            >
              الكل
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                type="button"
                size="sm"
                variant={categorySlug === category.slug ? 'default' : 'outline'}
                onClick={() => setCategoryFilter(category.slug)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        ) : null}

        {error ? <p className="mb-6 text-sm text-danger">{error}</p> : null}

        {loading ? (
          <p className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center text-mocha">
            جاري تحميل المنتجات...
          </p>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-taupe/50 bg-card p-10 text-center">
            <p className="font-display text-lg text-brown">لا توجد منتجات للعرض</p>
            <p className="mt-2 text-sm text-mocha">
              {query || categorySlug
                ? 'جرّبي تعديل البحث أو اختيار تصنيف آخر.'
                : 'كتالوج أثر فارغ حالياً — عودي قريباً.'}
            </p>
            {(query || categorySlug) && (
              <Button asChild variant="outline" className="mt-5">
                <Link to="/products">عرض كل المنتجات</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
