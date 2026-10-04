import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import atharLogoTransparent from '@/assets/athar-logo-transparent.png'
import { BrandLogo } from '@/components/BrandLogo'
import { ContactLinks } from '@/components/ContactLinks'
import { StoreLocationMap } from '@/components/location/StoreLocationMap'
import { Separator } from '@/components/ui/separator'
import { atharContact } from '@/config/contact'
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
      <div className="container-athar py-4">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1.05fr_1fr_0.9fr_1.35fr] lg:items-start lg:gap-5">
          <div className="max-w-[15rem] space-y-1.5">
            <BrandLogo
              src={atharLogoTransparent}
              imgClassName="h-10 w-10 object-contain sm:h-11 sm:w-11"
            />
            <p className="font-display text-[15px] font-semibold leading-none">أثر</p>
            <p className="text-[11px] leading-[1.4] text-cream/65">
              علامة مصرية راقية للحقائب والإكسسوارات. نختار التفاصيل بعناية لتترك إطلالتك أثراً يدوم.
            </p>
            <ContactLinks
              showPhone={false}
              compact
              className="pt-0.5 text-cream/80"
              iconClassName="hover:border-gold/40 hover:text-gold-soft"
            />
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-gold-soft">
              التسوق
            </h3>
            <ul className="space-y-1">
              <li>
                <Link
                  to="/products"
                  className="text-[12px] text-cream/75 transition-colors hover:text-cream"
                >
                  جميع المنتجات
                </Link>
              </li>
              <li>
                <Link
                  to="/products?sale=1"
                  className="text-[12px] text-cream/75 transition-colors hover:text-cream"
                >
                  عروض
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/category/${category.slug}`}
                    className="text-[12px] text-cream/75 transition-colors hover:text-cream"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-gold-soft">
              معلومات
            </h3>
            <ul className="space-y-1">
              <li>
                <Link
                  to="/return-policy"
                  className="text-[12px] text-cream/75 transition-colors hover:text-cream"
                >
                  سياسة الاستبدال والاسترجاع
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-[12px] text-cream/75 transition-colors hover:text-cream"
                >
                  الشروط والأحكام
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[11px] font-semibold tracking-wide text-gold-soft">
              تواصل معنا
            </h3>
            <div className="space-y-1 text-[12px] leading-[1.35] text-cream/75">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] tracking-wide text-cream/45">الهاتف</span>
                <a
                  href={atharContact.phoneTel}
                  className="text-cream transition-colors hover:text-gold-soft"
                  dir="ltr"
                >
                  {atharContact.phoneDisplay}
                </a>
              </p>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] tracking-wide text-cream/45">البريد الإلكتروني</span>
                <a
                  href={atharContact.emailMailto}
                  className="break-all text-cream transition-colors hover:text-gold-soft"
                  dir="ltr"
                >
                  {atharContact.emailDisplay}
                </a>
              </p>
              <p>
                <span className="mb-0.5 block text-[10px] tracking-wide text-cream/45">العنوان</span>
                <a
                  href={atharContact.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] leading-[1.35] transition-colors hover:text-cream"
                >
                  {atharContact.addressDisplay}
                </a>
              </p>
            </div>
            <StoreLocationMap />
          </div>
        </div>

        <Separator className="my-2 bg-cream/10" />

        <div className="flex flex-col gap-1 text-[11px] text-cream/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} أثر. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-4">
            <p className="tracking-[0.22em] text-cream/35">BAGS</p>
            <Link
              to="/admin/login"
              className="text-cream/30 transition-colors hover:text-cream/65"
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
