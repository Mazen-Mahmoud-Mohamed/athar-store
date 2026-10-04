import { Link, useNavigate, useParams } from 'react-router-dom'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { JsonLd } from '@/components/seo/JsonLd'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { productPath, truncateMeta } from '@/config/site'
import {
  CatalogEmpty,
  CatalogError,
  ProductDetailsSkeleton,
} from '@/features/catalog/CatalogStates'
import { ProductCard } from '@/features/products/ProductCard'
import { useCart } from '@/features/cart/cart-context'
import { getErrorMessage } from '@/lib/errors'
import { catalogImageProps } from '@/lib/imageUrl'
import { productBreadcrumbs, productSchema } from '@/lib/seoSchema'
import { calcDiscountPercent, formatPrice } from '@/lib/utils'
import { getProductById, getProductBySlug, getProductsByCategory } from '@/services/productService'
import type { Product } from '@/types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function resolveProduct(param: string): Promise<Product | null> {
  const bySlug = await getProductBySlug(param)
  if (bySlug) return bySlug
  if (UUID_RE.test(param)) return getProductById(param)
  return null
}

export function ProductDetailsPage() {
  const { id: routeParam } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [qty, setQty] = useState(1)
  const [product, setProduct] = useState<Product | null>(null)
  const [related, setRelated] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [imgMode, setImgMode] = useState<'optimized' | 'original' | 'failed'>('optimized')
  const [addedFlash, setAddedFlash] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!routeParam) return
      setLoading(true)
      setNotFound(false)
      setQty(1)
      setImgMode('optimized')
      try {
        const found = await resolveProduct(routeParam)
        if (!active) return
        setProduct(found)
        if (!found) {
          setRelated([])
          setNotFound(true)
          setError(null)
          return
        }

        // Prefer clean slug URLs when an old UUID link is opened.
        if (found.slug && routeParam !== found.slug) {
          navigate(productPath(found), { replace: true })
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
        setError(getErrorMessage(err, 'تعذر تحميل المنتج. حاول مرة أخرى.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [routeParam, reloadKey, navigate])

  const schemaProduct = useMemo(
    () => (product ? productSchema(product) : null),
    [product],
  )
  const schemaBreadcrumbs = useMemo(
    () => (product ? productBreadcrumbs(product) : null),
    [product],
  )

  if (loading) {
    return (
      <>
        {/* Avoid indexing transient UUID/slug paths before the product resolves. */}
        <PageMeta title="المنتج" path="/products" noIndex />
        <ProductDetailsSkeleton />
      </>
    )
  }

  if (error) {
    return (
      <div className="container-athar py-16">
        <PageMeta title="تعذر تحميل المنتج" path="/products" noIndex />
        <CatalogError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="container-athar py-16">
        <PageMeta title="المنتج غير متوفر" path="/products" noIndex />
        <CatalogEmpty
          title="المنتج غير متوفر"
          description="قد يكون المنتج غير نشط أو غير موجود حالياً."
          actionLabel="العودة للمنتجات"
          actionTo="/products"
        />
      </div>
    )
  }

  const current = product
  const discount = calcDiscountPercent(current.price, current.old_price)
  const outOfStock = current.stock_quantity <= 0
  const maxQty = Math.max(current.stock_quantity, 0)
  const detailImage =
    imgMode === 'failed' || !current.image_url
      ? null
      : imgMode === 'original'
        ? { src: current.image_url, width: 960, height: 1200 }
        : catalogImageProps(current.image_url, 'detail')
  const description = truncateMeta(
    current.description?.trim() ||
      `${current.name} من أثر — حقائب وشنط وإكسسوارات أنيقة.`,
  )

  function handleAdd() {
    if (outOfStock) return
    const safeQty = Math.min(qty, maxQty)
    if (safeQty < 1) return
    addItem(
      {
        productId: current.id,
        name: current.name,
        price: current.price,
        imageUrl: current.image_url,
        slug: current.slug,
      },
      safeQty,
    )
    setAddedFlash(true)
    window.setTimeout(() => setAddedFlash(false), 1800)
  }

  return (
    <>
      <PageMeta
        title={current.name}
        description={description}
        path={productPath(current)}
        image={current.image_url}
        ogType="product"
      />
      {schemaProduct ? <JsonLd id="product" data={schemaProduct} /> : null}
      {schemaBreadcrumbs ? <JsonLd id="product-breadcrumb" data={schemaBreadcrumbs} /> : null}

      <div className="container-athar py-8 sm:py-12">
        <nav aria-label="مسار التنقل" className="mb-6 text-sm text-mocha">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-brown">
                الرئيسية
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link to="/products" className="hover:text-brown">
                المنتجات
              </Link>
            </li>
            {current.category ? (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    to={`/category/${current.category.slug}`}
                    className="hover:text-brown"
                  >
                    {current.category.name}
                  </Link>
                </li>
              </>
            ) : null}
            <li aria-hidden="true">/</li>
            <li className="line-clamp-1 text-brown" aria-current="page">
              {current.name}
            </li>
          </ol>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="overflow-hidden rounded-xl bg-mist">
            <div className="aspect-[4/5]">
              {detailImage ? (
                <img
                  src={detailImage.src}
                  srcSet={'srcSet' in detailImage ? detailImage.srcSet : undefined}
                  sizes={'sizes' in detailImage ? detailImage.sizes : undefined}
                  alt={current.name}
                  width={detailImage.width}
                  height={detailImage.height}
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover"
                  onError={() =>
                    setImgMode((mode) =>
                      mode === 'optimized' && current.image_url ? 'original' : 'failed',
                    )
                  }
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-mist via-ivory to-sand/80">
                  <span className="font-display text-5xl font-semibold text-brown/20">أثر</span>
                  <span className="text-xs tracking-[0.25em] text-mocha/40">BAGS</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {current.category ? (
              <Link
                to={`/category/${current.category.slug}`}
                className="text-xs tracking-wide text-mocha hover:text-brown"
              >
                {current.category.name}
              </Link>
            ) : null}

            <h1 className="font-display text-3xl font-semibold leading-snug sm:text-4xl">
              {current.name}
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold text-brown">{formatPrice(current.price)}</p>
              {current.old_price && current.old_price > current.price ? (
                <p className="text-base text-mocha line-through">
                  {formatPrice(current.old_price)}
                </p>
              ) : null}
              {discount ? <Badge variant="gold">خصم {discount}%</Badge> : null}
              {current.is_new ? <Badge variant="soft">جديد</Badge> : null}
              {current.is_featured ? <Badge variant="outline">مميز</Badge> : null}
            </div>

            {current.description ? (
              <p className="text-sm leading-8 text-mocha sm:text-base">{current.description}</p>
            ) : null}

            <p className="text-sm text-mocha">
              التوفر:{' '}
              <span className={outOfStock ? 'font-medium text-danger' : 'font-medium text-success'}>
                {outOfStock ? 'غير متوفر حالياً' : `متوفر (${current.stock_quantity})`}
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="inline-flex items-center rounded-md border border-taupe/50 bg-card">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="تقليل الكمية"
                  disabled={outOfStock || qty <= 1}
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
                  disabled={outOfStock || qty >= maxQty}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                >
                  <Plus />
                </Button>
              </div>

              <Button
                size="lg"
                className="min-w-44 flex-1 sm:flex-none"
                disabled={outOfStock}
                onClick={handleAdd}
              >
                <ShoppingBag />
                {addedFlash ? 'تمت الإضافة' : 'أضيفي إلى السلة'}
              </Button>
            </div>

            {outOfStock ? (
              <p className="text-sm text-danger">لا يمكن إضافة هذا المنتج إلى السلة حالياً.</p>
            ) : null}
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-16 sm:mt-20" aria-labelledby="related-heading">
            <h2 id="related-heading" className="mb-8 font-display text-2xl font-semibold">
              منتجات ذات صلة
            </h2>
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
