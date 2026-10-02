import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { Separator } from '@/components/ui/separator'

const footerLinks = [
  {
    title: 'التسوق',
    links: [
      { label: 'جميع المنتجات', to: '/products' },
      { label: 'حقائب يد', to: '/category/handbags' },
      { label: 'حقائب كروس', to: '/category/crossbody' },
      { label: 'إكسسوارات', to: '/category/accessories' },
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
  {
    title: 'تواصل',
    links: [
      { label: 'واتساب', to: '/' },
      { label: 'إنستغرام', to: '/' },
      { label: 'البريد', to: '/' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-auto border-t border-taupe/30 bg-espresso text-cream">
      <div className="container-athar py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_repeat(3,1fr)]">
          <div className="max-w-sm space-y-4">
            <BrandLogo imgClassName="h-20 w-20 brightness-110" />
            <p className="font-display text-2xl font-semibold">أثر</p>
            <p className="text-sm leading-7 text-cream/70">
              علامة مصرية راقية للحقائب والإكسسوارات. نختار التفاصيل بعناية لتترك إطلالتك أثراً يدوم.
            </p>
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
