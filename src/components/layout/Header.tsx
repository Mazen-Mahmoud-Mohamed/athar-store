import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Search, ShoppingBag, X } from 'lucide-react'
import atharLogoTransparent from '@/assets/athar-logo-transparent.png'
import { BrandLogo } from '@/components/BrandLogo'
import { ContactLinks } from '@/components/ContactLinks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCart } from '@/features/cart/cart-context'
import { cn } from '@/lib/utils'

const navLinks = [
  { to: '/', label: 'الرئيسية' },
  { to: '/products', label: 'المنتجات' },
  { to: '/#categories', label: 'التصنيفات' },
  { to: '/products?sale=1', label: 'عروض' },
]

function cartAriaLabel(itemCount: number) {
  if (itemCount <= 0) return 'سلة التسوق'
  if (itemCount === 1) return 'سلة التسوق، منتج واحد'
  return `سلة التسوق، ${itemCount} منتجات`
}

function isNavActive(to: string, pathname: string, search: string, hash: string) {
  if (to === '/') return pathname === '/' && !hash
  if (to === '/#categories') return pathname === '/' && hash === '#categories'
  if (to === '/products?sale=1') {
    return pathname === '/products' && new URLSearchParams(search).get('sale') === '1'
  }
  if (to === '/products') {
    return pathname === '/products' && new URLSearchParams(search).get('sale') !== '1'
  }
  return pathname === to
}

function NavItem({
  to,
  label,
  onNavigate,
}: {
  to: string
  label: string
  onNavigate?: () => void
}) {
  const location = useLocation()
  const active = isNavActive(to, location.pathname, location.search, location.hash)

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        'relative text-sm font-medium text-mocha transition-colors hover:text-brown',
        active &&
          'text-brown after:absolute after:-bottom-1 after:start-0 after:h-px after:w-full after:bg-gold',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}

export function Header() {
  const { itemCount } = useCart()
  const location = useLocation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const cartLabel = cartAriaLabel(itemCount)

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const q = searchValue.trim()
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products')
    setSearchOpen(false)
    setMobileOpen(false)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q')
    if (q != null) setSearchValue(q)
  }, [location.search])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-all duration-300',
        scrolled
          ? 'border-taupe/30 bg-cream/90 shadow-soft backdrop-blur-md'
          : 'border-transparent bg-cream/70 backdrop-blur-sm',
      )}
    >
      <div className="container-athar">
        <div className="hidden h-20 items-center justify-between gap-6 md:flex">
          <div className="flex min-w-0 items-center gap-4 lg:gap-5">
            <Link to="/" className="shrink-0" aria-label="أثر — الصفحة الرئيسية">
              <BrandLogo
                priority
                src={atharLogoTransparent}
                alt=""
                imgClassName="h-14 w-14 object-contain"
              />
            </Link>
            <nav
              className="flex min-w-0 items-center gap-5 lg:gap-6"
              aria-label="القائمة الرئيسية"
            >
              {navLinks.map((link) => (
                <NavItem key={link.label} to={link.to} label={link.label} />
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <form onSubmit={submitSearch} className="relative w-[200px] lg:w-[240px]" role="search">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mocha"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="ابحثي في أثر..."
                className="h-10 pe-3 ps-9"
                aria-label="بحث في المنتجات"
              />
            </form>
            <Button asChild variant="ghost" size="icon" className="relative" aria-label={cartLabel}>
              <Link to="/cart">
                <ShoppingBag aria-hidden="true" />
                {itemCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-espresso"
                    aria-hidden="true"
                  >
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex h-16 items-center justify-between md:hidden">
          {/* First in RTL flex = far right: hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="فتح القائمة"
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-cream" id="mobile-navigation">
              <SheetHeader className="items-center pe-8">
                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                <SheetDescription className="sr-only">
                  روابط التنقل في متجر أثر
                </SheetDescription>
                <BrandLogo
                  src={atharLogoTransparent}
                  alt=""
                  imgClassName="h-16 w-16 object-contain"
                />
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-5 text-start" aria-label="قائمة الجوال">
                {navLinks.map((link) => (
                  <NavItem
                    key={link.label}
                    to={link.to}
                    label={link.label}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
              <form onSubmit={submitSearch} className="relative mt-8" role="search">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mocha"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="ابحثي في أثر..."
                  className="h-11 pe-3 ps-9"
                  aria-label="بحث في المنتجات"
                />
              </form>
              <div className="mt-8 space-y-4 border-t border-taupe/30 pt-6">
                <p className="text-sm text-mocha">أناقة تترك أثراً</p>
                <ContactLinks
                  showPhone={false}
                  className="text-mocha"
                  iconClassName="hover:border-gold/50 hover:text-brown"
                  compact
                />
              </div>
            </SheetContent>
          </Sheet>

          {/* Last in RTL flex = far left: search + cart */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={searchOpen ? 'إغلاق البحث' : 'بحث'}
              aria-expanded={searchOpen}
              aria-controls="mobile-search"
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative" aria-label={cartLabel}>
              <Link to="/cart">
                <ShoppingBag aria-hidden="true" />
                {itemCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-espresso"
                    aria-hidden="true"
                  >
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          </div>
        </div>

        {searchOpen ? (
          <div className="pb-4 md:hidden" id="mobile-search">
            <form onSubmit={submitSearch} className="relative" role="search">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mocha"
                aria-hidden="true"
              />
              <Input
                autoFocus
                type="search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="ابحثي في أثر..."
                className="h-11 pe-3 ps-9"
                aria-label="بحث في المنتجات"
              />
            </form>
          </div>
        ) : null}
      </div>
    </header>
  )
}
