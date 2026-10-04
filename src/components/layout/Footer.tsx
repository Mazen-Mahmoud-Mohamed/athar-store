import { Link } from 'react-router-dom'
import atharLogoTransparent from '@/assets/athar-logo-transparent.png'
import { BrandLogo } from '@/components/BrandLogo'
import { ContactLinks } from '@/components/ContactLinks'
import { StoreLocationMap } from '@/components/location/StoreLocationMap'
import { Separator } from '@/components/ui/separator'
import { atharContact } from '@/config/contact'

/**
 * Desktop RTL visual order (right → left):
 * أثر + social · معلومات · تواصل معنا · Google Map
 * DOM order matches that so the first column sits on the right in RTL.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-taupe/30 bg-espresso text-cream">
      <div className="container-athar py-10 sm:py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.15fr_0.85fr_1.1fr_1.25fr] lg:items-start lg:gap-8 xl:gap-10">
          {/* 1 — Brand (visual right in RTL) */}
          <div className="max-w-sm space-y-4">
            <BrandLogo
              src={atharLogoTransparent}
              alt=""
              imgClassName="h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
            />
            <p className="font-display text-xl font-semibold sm:text-2xl">أثر</p>
            <p className="text-sm leading-7 text-cream/70">
              علامة مصرية راقية للحقائب والإكسسوارات. نختار التفاصيل بعناية لتترك إطلالتك أثراً يدوم.
            </p>
            <ContactLinks
              showPhone={false}
              className="pt-1 text-cream/80"
              iconClassName="hover:border-gold/40 hover:text-gold-soft"
            />
          </div>

          {/* 2 — Info */}
          <div>
            <p className="mb-4 text-sm font-semibold tracking-wide text-gold-soft">معلومات</p>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/return-policy"
                  className="text-sm text-cream/75 transition-colors hover:text-cream"
                >
                  سياسة الاستبدال والاسترجاع
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-sm text-cream/75 transition-colors hover:text-cream"
                >
                  الشروط والأحكام
                </Link>
              </li>
            </ul>
          </div>

          {/* 3 — Contact */}
          <div className="space-y-4">
            <p className="text-sm font-semibold tracking-wide text-gold-soft">تواصل معنا</p>
            <div className="space-y-3 text-sm leading-7 text-cream/75">
              <p className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                <span className="text-xs tracking-wide text-cream/50">الهاتف</span>
                <a
                  href={atharContact.phoneTel}
                  className="text-cream transition-colors hover:text-gold-soft"
                  dir="ltr"
                >
                  {atharContact.phoneDisplay}
                </a>
              </p>
              <p className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
                <span className="text-xs tracking-wide text-cream/50">البريد الإلكتروني</span>
                <a
                  href={atharContact.emailMailto}
                  className="break-all text-cream transition-colors hover:text-gold-soft"
                  dir="ltr"
                >
                  {atharContact.emailDisplay}
                </a>
              </p>
              <p>
                <span className="mb-1 block text-xs tracking-wide text-cream/50">العنوان</span>
                <a
                  href={atharContact.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="leading-7 text-cream/80 transition-colors hover:text-cream"
                >
                  {atharContact.addressDisplay}
                </a>
              </p>
            </div>
          </div>

          {/* 4 — Map (visual left in RTL) */}
          <div className="sm:col-span-2 lg:col-span-1">
            <StoreLocationMap />
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
