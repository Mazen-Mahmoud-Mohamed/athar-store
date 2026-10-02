import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { CategoryCard } from '@/features/categories/CategoryCard'
import { ProductCard } from '@/features/products/ProductCard'
import { getErrorMessage } from '@/lib/errors'
import { getActiveCategories } from '@/services/categoryService'
import {
  getActiveProducts,
  getFeaturedProducts,
  getNewProducts,
} from '@/services/productService'
import type { Category, Product } from '@/types'

function SectionEmpty({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-taupe/45 bg-card/60 px-6 py-10 text-center text-sm text-mocha">
      {message}
    </p>
  )
}

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [offers, setOffers] = useState<Product[]>([])
  const [newcomers, setNewcomers] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [cats, featuredProducts, newProducts, allProducts] = await Promise.all([
          getActiveCategories(),
          getFeaturedProducts(),
          getNewProducts(),
          getActiveProducts(),
        ])
        if (!active) return
        setCategories(cats)
        setFeatured(featuredProducts.slice(0, 4))
        setNewcomers(newProducts.slice(0, 4))
        setOffers(allProducts.filter((p) => p.old_price != null && p.old_price > p.price).slice(0, 4))
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل واجهة المتجر'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageMeta
        title="الرئيسية"
        description="أثر — علامة مصرية راقية للحقائب والإكسسوارات. أناقة تترك أثراً."
      />

      <section className="relative overflow-hidden border-b border-taupe/20">
        <div className="absolute inset-0 surface-warm" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgb(184 149 108 / 0.18), transparent 35%), radial-gradient(circle at 80% 10%, rgb(232 213 203 / 0.45), transparent 40%)',
          }}
        />
        <div className="container-athar relative grid min-h-[78vh] items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="max-w-xl space-y-6 sm:space-y-7">
            <BrandLogo priority imgClassName="h-20 w-20 sm:h-28 sm:w-28" />
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-semibold leading-[1.25] text-brown sm:text-5xl lg:text-[3.4rem]">
                أناقة تترك أثرًا
              </h1>
              <p className="max-w-md text-base leading-8 text-mocha sm:text-lg">
                حقائب وإكسسوارات مصرية بروح أنثوية راقية — تفاصيل دافئة، حضور هادئ، ولمسة لا تُنسى.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/products">
                  تسوّقي الآن
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/products">اكتشفي المجموعات</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div
              className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden bg-gradient-to-br from-sand via-mist to-blush shadow-lift lg:max-w-none"
              aria-hidden="true"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <BrandLogo priority imgClassName="h-52 w-52 sm:h-64 sm:w-64" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="container-athar py-8">
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        </div>
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
          <SectionEmpty message="جاري تحميل التصنيفات..." />
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        ) : (
          <SectionEmpty message="لا توجد تصنيفات نشطة حالياً." />
        )}
      </section>

      <section className="border-y border-taupe/25 bg-card/40 py-16 sm:py-20">
        <div className="container-athar">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">مختارات أثر</p>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">منتجات مميزة</h2>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/products">كل المنتجات</Link>
            </Button>
          </div>
          {loading ? (
            <SectionEmpty message="جاري تحميل المنتجات المميزة..." />
          ) : featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <SectionEmpty message="لا توجد منتجات مميزة حالياً." />
          )}
        </div>
      </section>

      <section className="container-athar py-16 sm:py-20" id="offers">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs tracking-[0.25em] text-gold-deep">
              <Sparkles className="size-3.5" />
              عروض خاصة
            </p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">وفّري بذوق راقٍ</h2>
          </div>
        </div>
        {loading ? (
          <SectionEmpty message="جاري تحميل العروض..." />
        ) : offers.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {offers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <SectionEmpty message="لا توجد عروض حالياً." />
        )}
      </section>

      <section className="bg-mist/70 py-16 sm:py-20">
        <div className="container-athar">
          <div className="mb-10">
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">وصل حديثاً</p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">وصل حديثًا</h2>
          </div>
          {loading ? (
            <SectionEmpty message="جاري تحميل المنتجات الجديدة..." />
          ) : newcomers.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {newcomers.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <SectionEmpty message="لا توجد منتجات جديدة حالياً." />
          )}
        </div>
      </section>

      <section className="container-athar py-16 sm:py-24">
        <div className="grid overflow-hidden rounded-2xl bg-espresso text-cream lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-5 p-8 sm:p-12">
            <p className="text-xs tracking-[0.28em] text-gold-soft">أثر EDITORIAL</p>
            <h2 className="font-display text-3xl font-semibold leading-snug sm:text-4xl">
              قطعة واحدة… حضور كامل
            </h2>
            <p className="max-w-md text-sm leading-8 text-cream/70 sm:text-base">
              نصمم ونختار قطعًا توازن بين العملية والرقي، بألوان دافئة وتفاصيل ذهبية هادئة مستوحاة من هوية أثر.
            </p>
            <div>
              <Button asChild variant="gold">
                <Link to="/products">استكشفي المجموعة</Link>
              </Button>
            </div>
          </div>
          <div className="relative min-h-64 bg-gradient-to-br from-mocha/40 via-brown to-espresso">
            <div className="absolute inset-0 flex items-center justify-center">
              <BrandLogo imgClassName="h-40 w-40 opacity-95" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-taupe/25 bg-card/50 py-16 sm:py-20">
        <div className="container-athar">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">لماذا أثر؟</p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">قيم تُرى في كل تفصيلة</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
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
              <div key={item.title} className="rounded-lg border border-taupe/30 bg-cream/70 p-6">
                <div className="mb-4 h-px w-10 bg-gold" />
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-mocha">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
