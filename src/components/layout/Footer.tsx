import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import atharLogoTransparent from '@/assets/athar-logo-transparent.png'
import { BrandLogo } from '@/components/BrandLogo'
import { ContactLinks } from '@/components/ContactLinks'
import { Separator } from '@/components/ui/separator'
import { getActiveCategories } from '@/services/categoryService'
import type { Category } from '@/types'

export function Footer() {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    let active = true
    void getActiveCategories()
      .then((rows) => {
        if (active) setCategories(rows)
      })
      .catch(() => {
        if (active) setCategories([])
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <footer className="mt-auto border-t border-taupe/30 bg-espresso text-cream">
      <div className="container-athar py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between md:gap-16">
          <div className="max-w-sm space-y-4">
            <BrandLogo
              src={atharLogoTransparent}
              imgClassName="h-20 w-20 object-contain"
            />
            <p className="font-display text-2xl font-semibold">أثر</p>
            <p className="text-sm leading-7 text-cream/70">
              علامة مصرية راقية للحقائب والإكسسوارات. نختار التفاصيل بعناية لتترك إطلالتك أثراً يدوم.
            </p>
            <ContactLinks
              showPhone={false}
              className="pt-1 text-cream/80"
              iconClassName="hover:border-gold/40 hover:text-gold-soft"
            />
          </div>

          <div className="md:min-w-[12rem]">
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-gold-soft">التسوق</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/products"
                  className="text-sm text-cream/75 transition-colors hover:text-cream"
                >
                  جميع المنتجات
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sale=1"
                  className="text-sm text-cream/75 transition-colors hover:text-cream"
                >
                  عروض
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/category/${category.slug}`}
                    className="text-sm text-cream/75 transition-colors hover:text-cream"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-cream/10" />

        <div className="flex flex-col gap-3 text-xs text-cream/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} أثر. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-4">
            <p className="tracking-[0.25em] text-cream/40">BAGS</p>
            <Link
              to="/admin/login"
              className="text-cream/35 transition-colors hover:text-cream/70"
              aria-label="دخول لوحة الإدارة"
            >
              للإدارة
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
