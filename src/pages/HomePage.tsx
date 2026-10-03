import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import atharLogoTransparent from '@/assets/athar-logo-transparent.png'
import { BrandLogo } from '@/components/BrandLogo'
import { WhatsAppCta } from '@/components/ContactLinks'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { CategoryCard } from '@/features/categories/CategoryCard'
import {
  CatalogError,
  CategoryGridSkeleton,
  ProductGridSkeleton,
} from '@/features/catalog/CatalogStates'
import { ProductCard } from '@/features/products/ProductCard'
import { isOnSale } from '@/lib/catalog'
import { getErrorMessage } from '@/lib/errors'
import { getActiveCategories } from '@/services/categoryService'
import {
  getActiveProducts,
  getFeaturedProducts,
  getNewProducts,
} from '@/services/productService'
import type { Category, Product } from '@/types'

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [newcomers, setNewcomers] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [heroImgFailed, setHeroImgFailed] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [cats, featuredProducts, newProducts, products] = await Promise.all([
          getActiveCategories(),
          getFeaturedProducts(),
          getNewProducts(),
          getActiveProducts(),
        ])
        if (!active) return
        setCategories(cats)
        setFeatured(featuredProducts.slice(0, 4))
        setNewcomers(newProducts.slice(0, 4))
        setAllProducts(products)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل واجهة المتجر. حاول مرة أخرى.'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [reloadKey])

  const offers = useMemo(
    () => allProducts.filter(isOnSale).slice(0, 4),
    [allProducts],
  )

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const product of allProducts) {
      if (!product.category_id) continue
      map.set(product.category_id, (map.get(product.category_id) ?? 0) + 1)
    }
    return map
  }, [allProducts])

  const heroProduct = featured[0] ?? newcomers[0] ?? allProducts[0] ?? null
  const heroImage = heroProduct?.image_url && !heroImgFailed ? heroProduct.image_url : null

  return (
    <>
      <PageMeta
        title="الرئيسية"
        description="أثر — علامة مصرية راقية للحقائب والإكسسوارات. أناقة تترك أثراً."
        path="/"
        image={heroImage}
      />

      <section className="relative overflow-hidden border-b border-taupe/20">
        <div className="absolute inset-0 surface-warm" />
        <div className="container-athar relative grid items-center gap-8 py-12 sm:gap-10 lg:min-h-[72vh] lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="max-w-xl space-y-6">
            <BrandLogo
              priority
              src={atharLogoTransparent}
              imgClassName="h-20 w-20 sm:h-24 sm:w-24"
            />
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-semibold leading-[1.25] text-brown sm:text-5xl lg:text-[3.25rem]">
                أناقة تترك أثرًا
              </h1>
              <p className="max-w-md text-base leading-8 text-mocha sm:text-lg">
                حقائب وإكسسوارات مصرية بروح أنثوية راقية — تفاصيل دافئة، حضور هادئ، ولمسة لا تُنسى.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/products">
                  تسوقي الآن
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/#categories">اكتشفي المجموعة</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden bg-mist shadow-lift lg:max-w-none">
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={heroProduct?.name ?? 'أثر'}
                  className="h-full w-full object-cover"
                  onError={() => setHeroImgFailed(true)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sand via-mist to-blush">
                  <BrandLogo
                    priority
                    src={atharLogoTransparent}
                    imgClassName="h-44 w-44 sm:h-56 sm:w-56"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="container-athar py-8">
          <CatalogError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        </div>
      ) : null}

      {(loading || featured.length > 0) && !error ? (
        <section className="border-b border-taupe/25 bg-card/40 py-16 sm:py-20">
          <div className="container-athar">
            <div className="mb-10 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">مختارات أثر</p>
                <h2 className="font-display text-2xl font-semibold sm:text-3xl">منتجات مميزة</h2>
              </div>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link to="/products?featured=1">كل المميز</Link>
              </Button>
            </div>
            {loading ? (
              <ProductGridSkeleton count={4} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {featured.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="container-athar py-16 sm:py-20" id="categories">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">التصنيفات</p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">تسوقي حسب المجموعة</h2>
          </div>
          <Button asChild variant="link" className="hidden sm:inline-flex">
            <Link to="/products">عرض الكل</Link>
          </Button>
        </div>
        {loading ? (
          <CategoryGridSkeleton count={4} />
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                productCount={categoryCounts.get(category.id) ?? 0}
              />
            ))}
          </div>
        ) : !error ? (
          <p className="rounded-lg border border-dashed border-taupe/45 bg-card/60 px-6 py-10 text-center text-sm text-mocha">
            لا توجد تصنيفات نشطة حالياً.
          </p>
        ) : null}
      </section>

      {(loading || newcomers.length > 0) && !error ? (
        <section className="bg-mist/70 py-16 sm:py-20">
          <div className="container-athar">
            <div className="mb-10 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">وصل حديثاً</p>
                <h2 className="font-display text-2xl font-semibold sm:text-3xl">وصل حديثًا</h2>
              </div>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link to="/products?new=1">كل الجديد</Link>
              </Button>
            </div>
            {loading ? (
              <ProductGridSkeleton count={4} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {newcomers.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {!loading && offers.length > 0 ? (
        <section className="container-athar py-16 sm:py-20" id="offers">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">عروض خاصة</p>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">وفّري بذوق راقٍ</h2>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/products?sale=1">كل العروض</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {offers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-t border-taupe/25 bg-card/50 py-16 sm:py-20">
        <div className="container-athar">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">لماذا أثر؟</p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">قيم تُرى في كل تفصيلة</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                title: 'أناقة أنثوية',
                body: 'تصاميم هادئة تنسجم مع ذوقك اليومي والمناسبات الخاصة.',
              },
              {
                title: 'جودة مختارة',
                body: 'خامات وتشطيبات نختارها بعناية لتدوم وتُشعرِكِ بالثقة.',
              },
              {
                title: 'أثر مصري',
                body: 'هوية محلية راقية بروح عصرية تناسب أسلوب حياتك.',
              },
            ].map((item) => (
              <div key={item.title} className="border-t border-gold/40 pt-5">
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-mocha">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-athar py-16 sm:py-20">
        <div className="mx-auto max-w-2xl rounded-2xl bg-espresso px-6 py-12 text-center text-cream sm:px-10">
          <p className="mb-2 text-xs tracking-[0.28em] text-gold-soft">تواصلي معنا</p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">استفسارك مهم لنا</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-cream/70">
            راسلينا عبر واتساب لأي استفسار عن المقاسات، التوفر، أو اختيار القطعة المناسبة.
          </p>
          <WhatsAppCta className="mt-7" label="تواصلي عبر واتساب" />
        </div>
      </section>
    </>
  )
}
