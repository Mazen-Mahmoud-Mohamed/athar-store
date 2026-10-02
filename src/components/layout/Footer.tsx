import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { ContactLinks, WhatsAppCta } from '@/components/ContactLinks'
import { Separator } from '@/components/ui/separator'
import { atharContact } from '@/config/contact'

const footerLinks = [
  {
    title: 'التسوق',
    links: [
      { label: 'جميع المنتجات', to: '/products' },
      { label: 'حقائب يد', to: '/category/handbags' },
      { label: 'حقائب كتف', to: '/category/shoulder-bags' },
      { label: 'حقائب سهرة', to: '/category/evening-bags' },
    ],
  },
  {
    title: 'أثر',
    links: [
      { label: 'قصتنا', to: '/' },
      { label: 'العناية بالمنتجات', to: '/' },
      { label: 'الشحن والتوصيل', to: '/' },
      { label: 'سياسة الاستبدال', to: '/' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-auto border-t border-taupe/30 bg-espresso text-cream">
      <div className="container-athar py-14">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(2,1fr)_1.1fr]">
          <div className="max-w-sm space-y-4">
            <BrandLogo imgClassName="h-20 w-20 brightness-110" />
            <p className="font-display text-2xl font-semibold">أثر</p>
            <p className="text-sm leading-7 text-cream/70">
              علامة مصرية راقية للحقائب والإكسسوارات. نختار التفاصيل بعناية لتترك إطلالتك أثراً يدوم.
            </p>
            <ContactLinks
              className="pt-1 text-cream/80"
              iconClassName="hover:border-gold/40 hover:text-gold-soft"
            />
          </div>

          {footerLinks.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-gold-soft">
                {group.title}
              </h3>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-cream/75 transition-colors hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-gold-soft">تواصل</h3>
            <ul className="space-y-3 text-sm text-cream/75">
              <li>
                <a
                  href={atharContact.phoneTel}
                  className="transition-colors hover:text-cream"
                  aria-label={`اتصل على ${atharContact.phoneDisplay}`}
                >
                  {atharContact.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={atharContact.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-cream"
                >
                  واتساب
                </a>
              </li>
            </ul>
            <WhatsAppCta className="mt-5 w-full sm:w-auto" />
          </div>
        </div>

        <Separator className="my-8 bg-cream/10" />

        <div className="flex flex-col gap-3 text-xs text-cream/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} أثر. جميع الحقوق محفوظة.</p>
          <p className="tracking-[0.25em] text-cream/40">BAGS</p>
        </div>
      </div>
    </footer>
  )
}
