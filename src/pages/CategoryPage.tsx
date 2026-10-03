import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CatalogControls,
  type CatalogControlValues,
} from '@/features/catalog/CatalogControls'
import {
  CatalogEmpty,
  CatalogError,
  ProductGridSkeleton,
} from '@/features/catalog/CatalogStates'
import { ProductCard } from '@/features/products/ProductCard'
import { filterAndSortProducts, type CatalogSort } from '@/lib/catalog'
import { getErrorMessage } from '@/lib/errors'
import { getCategoryBySlug } from '@/services/categoryService'
import { getProductsByCategory } from '@/services/productService'
import type { Category, Product } from '@/types'

function parseSort(value: string | null): CatalogSort {
  if (value === 'price_asc' || value === 'price_desc' || value === 'name' || value === 'newest') {
    return value
  }
  return 'newest'
}

export function CategoryPage() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState<Category | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const controls: CatalogControlValues = useMemo(
    () => ({
      categorySlug: '',
      sort: parseSort(searchParams.get('sort')),
      onlyNew: searchParams.get('new') === '1',
      onlyFeatured: searchParams.get('featured') === '1',
      onlySale: searchParams.get('sale') === '1',
      minPrice: searchParams.get('min')?.trim() ?? '',
      maxPrice: searchParams.get('max')?.trim() ?? '',
    }),
    [searchParams],
  )

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
        setError(getErrorMessage(err, 'تعذر تحميل التصنيف. حاول مرة أخرى.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [slug, reloadKey])

  const filtered = useMemo(() => {
    const min = controls.minPrice ? Number(controls.minPrice) : null
    const max = controls.maxPrice ? Number(controls.maxPrice) : null
    return filterAndSortProducts(products, {
      onlyNew: controls.onlyNew,
      onlyFeatured: controls.onlyFeatured,
      onlySale: controls.onlySale,
      minPrice: min != null && Number.isFinite(min) ? min : null,
      maxPrice: max != null && Number.isFinite(max) ? max : null,
      sort: controls.sort,
    })
  }, [products, controls])

  function updateControls(next: CatalogControlValues) {
    const params = new URLSearchParams()
    if (next.sort !== 'newest') params.set('sort', next.sort)
    if (next.onlyNew) params.set('new', '1')
    if (next.onlyFeatured) params.set('featured', '1')
    if (next.onlySale) params.set('sale', '1')
    if (next.minPrice) params.set('min', next.minPrice)
    if (next.maxPrice) params.set('max', next.maxPrice)
    setSearchParams(params, { replace: true })
  }

  function clearControls() {
    setSearchParams({}, { replace: true })
  }

  return (
    <>
      <PageMeta
        title={loading ? 'جارٍ التحميل' : (category?.name ?? 'التصنيف')}
        description={
          category?.description ??
          (category ? `تسوقي منتجات ${category.name} من أثر.` : 'تصنيفات أثر للحقائب والإكسسوارات.')
        }
        path={slug ? `/category/${slug}` : '/products'}
        image={category?.image_url}
      />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">التصنيف</p>
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="جارٍ تحميل التصنيف">
              <Skeleton className="h-10 w-48 sm:w-64" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">
                {category?.name ?? 'التصنيف'}
              </h1>
              {category?.description ? (
                <p className="mt-3 text-sm leading-7 text-mocha">{category.description}</p>
              ) : null}
            </>
          )}
        </div>

        {!loading && !notFound && !error ? (
          <CatalogControls
            categories={[]}
            values={controls}
            resultCount={filtered.length}
            onChange={updateControls}
            onClear={clearControls}
            hideCategory
            className="mb-8 border-b border-taupe/25 pb-8"
          />
        ) : null}

        {error ? (
          <CatalogError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : null}

        {loading ? (
          <ProductGridSkeleton count={8} />
        ) : notFound ? (
          <CatalogEmpty
            title="هذا القسم غير متاح"
            description="ربما تم إيقافه أو لم يعد موجوداً حالياً."
            actionLabel="العودة للمنتجات"
            actionTo="/products"
          />
        ) : !error && filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : !error ? (
          <CatalogEmpty
            title="لا توجد منتجات متاحة في هذا القسم حاليًا"
            description="عودي قريباً لاكتشاف قطع جديدة من أثر."
            actionLabel="عرض كل المنتجات"
            actionTo="/products"
          />
        ) : null}
      </div>
    </>
  )
}
