import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { JsonLd } from '@/components/seo/JsonLd'
import { PageMeta } from '@/components/seo/PageMeta'
import { PRODUCTS_DESCRIPTION, PRODUCTS_TITLE } from '@/config/site'
import {
  CatalogControls,
  type CatalogControlValues,
} from '@/features/catalog/CatalogControls'
import { itemListSchema } from '@/lib/seoSchema'
import {
  CatalogEmpty,
  CatalogError,
  ProductGridSkeleton,
} from '@/features/catalog/CatalogStates'
import { ProductCard } from '@/features/products/ProductCard'
import { filterAndSortProducts, type CatalogSort } from '@/lib/catalog'
import { getErrorMessage } from '@/lib/errors'
import { getActiveCategories } from '@/services/categoryService'
import { getActiveProducts, searchProducts } from '@/services/productService'
import type { Category, Product } from '@/types'

function parseSort(value: string | null): CatalogSort {
  if (value === 'price_asc' || value === 'price_desc' || value === 'name' || value === 'newest') {
    return value
  }
  return 'newest'
}

function valuesFromParams(params: URLSearchParams): CatalogControlValues {
  return {
    categorySlug: params.get('category')?.trim() ?? '',
    sort: parseSort(params.get('sort')),
    onlyNew: params.get('new') === '1',
    onlyFeatured: params.get('featured') === '1',
    onlySale: params.get('sale') === '1',
    minPrice: params.get('min')?.trim() ?? '',
    maxPrice: params.get('max')?.trim() ?? '',
  }
}

function writeParams(
  base: URLSearchParams,
  values: CatalogControlValues,
  query: string,
): URLSearchParams {
  const next = new URLSearchParams()
  if (query) next.set('q', query)
  if (values.categorySlug) next.set('category', values.categorySlug)
  if (values.sort !== 'newest') next.set('sort', values.sort)
  if (values.onlyNew) next.set('new', '1')
  if (values.onlyFeatured) next.set('featured', '1')
  if (values.onlySale) next.set('sale', '1')
  if (values.minPrice) next.set('min', values.minPrice)
  if (values.maxPrice) next.set('max', values.maxPrice)
  // Preserve unrelated params only if needed — keep catalog params clean.
  void base
  return next
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const controls = useMemo(() => valuesFromParams(searchParams), [searchParams])

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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
        setError(
          getErrorMessage(err, 'تعذر تحميل المنتجات. تحققي من الاتصال ثم حاولي مرة أخرى.'),
        )
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [query, reloadKey])

  const filtered = useMemo(() => {
    const min = controls.minPrice ? Number(controls.minPrice) : null
    const max = controls.maxPrice ? Number(controls.maxPrice) : null
    return filterAndSortProducts(products, {
      categorySlug: controls.categorySlug || undefined,
      onlyNew: controls.onlyNew,
      onlyFeatured: controls.onlyFeatured,
      onlySale: controls.onlySale,
      minPrice: min != null && Number.isFinite(min) ? min : null,
      maxPrice: max != null && Number.isFinite(max) ? max : null,
      sort: controls.sort,
    })
  }, [products, controls])

  function updateControls(next: CatalogControlValues) {
    setSearchParams(writeParams(searchParams, next, query), { replace: true })
  }

  function clearControls() {
    const next = new URLSearchParams()
    if (query) next.set('q', query)
    setSearchParams(next, { replace: true })
  }

  const hasActiveFilters = Boolean(
    controls.categorySlug ||
      controls.onlyNew ||
      controls.onlyFeatured ||
      controls.onlySale ||
      controls.minPrice ||
      controls.maxPrice ||
      controls.sort !== 'newest',
  )

  const emptyCatalog = !query && products.length === 0
  const emptySearch = Boolean(query) && filtered.length === 0
  const emptyFilters = !query && products.length > 0 && hasActiveFilters && filtered.length === 0

  const emptyTitle = emptyCatalog
    ? 'لا توجد منتجات للعرض حالياً'
    : emptySearch
      ? 'لا توجد منتجات مطابقة لبحثك'
      : 'لا توجد منتجات مطابقة للتصفية'
  const emptyDescription = emptyCatalog
    ? 'عودي قريباً لاكتشاف قطع جديدة من أثر.'
    : emptySearch
      ? 'جرّبي كلمات أخرى أو امسحي البحث لعرض المجموعة الكاملة.'
      : 'عدّلي التصفية أو اعرضي كل المنتجات.'

  const isDefaultListing =
    !query && !controls.onlySale && !controls.onlyNew && !controls.onlyFeatured
  const pageTitle = query
    ? `نتائج البحث: ${query}`
    : controls.onlySale
      ? 'العروض'
      : controls.onlyNew
        ? 'وصل حديثًا'
        : controls.onlyFeatured
          ? 'المنتجات المميزة'
          : PRODUCTS_TITLE

  const pageDescription = query
    ? `نتائج البحث في متجر أثر عن «${query}».`
    : PRODUCTS_DESCRIPTION

  return (
    <>
      <PageMeta
        title={pageTitle}
        description={pageDescription}
        path="/products"
        absoluteTitle={isDefaultListing}
        noIndex={Boolean(query)}
      />
      {!loading && !error && filtered.length > 0 && !query ? (
        <JsonLd
          id="products-itemlist"
          data={itemListSchema(
            isDefaultListing ? 'منتجات أثر' : pageTitle,
            filtered,
            '/products',
          )}
        />
      ) : null}
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">المجموعة الكاملة</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            {query ? `نتائج البحث: ${query}` : 'المنتجات'}
          </h1>
          <p className="mt-3 text-sm leading-7 text-mocha">
            اكتشفي قطع أثر المختارة بعناية — من الحقائب إلى الإكسسوارات.
          </p>
          {query ? (
            <p className="mt-2 text-sm text-mocha">
              نتائج البحث عن: <span className="font-medium text-brown">{query}</span>
            </p>
          ) : null}
        </div>

        <CatalogControls
          categories={categories}
          values={controls}
          resultCount={filtered.length}
          resultCountLoading={loading}
          onChange={updateControls}
          onClear={clearControls}
          className="mb-8 border-b border-taupe/25 pb-8"
        />

        {error ? (
          <CatalogError
            title="تعذر تحميل المنتجات"
            message={error}
            onRetry={() => setReloadKey((k) => k + 1)}
            secondaryLabel="العودة للرئيسية"
            secondaryTo="/"
          />
        ) : null}

        {loading ? (
          <ProductGridSkeleton
            count={8}
            className="lg:grid-cols-3 xl:grid-cols-4"
          />
        ) : !error && filtered.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index < 2}
              />
            ))}
          </div>
        ) : !error ? (
          <CatalogEmpty
            title={emptyTitle}
            description={emptyDescription}
            actionLabel={
              emptySearch ? 'مسح البحث' : emptyFilters ? 'مسح التصفية' : 'العودة للرئيسية'
            }
            actionTo={emptySearch ? '/products' : '/'}
            onAction={emptyFilters ? clearControls : undefined}
            secondaryLabel={emptySearch || emptyFilters ? 'العودة للرئيسية' : undefined}
            secondaryTo={emptySearch || emptyFilters ? '/' : undefined}
          />
        ) : null}
      </div>
    </>
  )
}
