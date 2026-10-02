import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCart } from '@/features/cart/cart-context'
import { cn } from '@/lib/utils'

const navLinks = [
  { to: '/', label: 'الرئيسية' },
  { to: '/products', label: 'المنتجات' },
  { to: '/products', label: 'التصنيفات', hash: '#categories' },
  { to: '/products', label: 'عروض', hash: '#offers' },
]

function NavItem({
  to,
  label,
  onNavigate,
}: {
  to: string
  label: string
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative text-sm font-medium text-mocha transition-colors hover:text-brown',
          isActive && 'text-brown after:absolute after:-bottom-1 after:start-0 after:h-px after:w-full after:bg-gold',
        )
      }
    >
      {label}
    </NavLink>
  )
}

export function Header() {
  const { itemCount } = useCart()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

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
        {/* Desktop */}
        <div className="hidden h-20 items-center justify-between gap-6 md:flex">
          <nav className="flex min-w-0 flex-1 items-center gap-6" aria-label="القائمة الرئيسية">
            <NavItem to="/" label="الرئيسية" />
            <NavItem to="/products" label="المنتجات" />
            <NavItem to="/category/handbags" label="التصنيفات" />
            <NavItem to="/products" label="عروض" />
          </nav>

          <Link to="/" className="shrink-0" aria-label="أثر — الصفحة الرئيسية">
            <BrandLogo priority imgClassName="h-14 w-14" />
          </Link>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="relative hidden w-full max-w-[220px] lg:block">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
              <Input
                type="search"
                placeholder="ابحث في أثر..."
                className="h-10 pe-3 ps-9"
                aria-label="بحث"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="بحث"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search />
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="الحساب">
              <Link to="/admin/login">
                <User />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="المفضلة" className="hidden lg:inline-flex">
              <Link to="/products">
                <Heart />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative" aria-label="سلة التسوق">
              <Link to="/cart">
                <ShoppingBag />
                {itemCount > 0 ? (
                  <span className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-espresso">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile */}
        <div className="flex h-16 items-center justify-between gap-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="فتح القائمة">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-cream">
              <SheetHeader>
                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                <BrandLogo imgClassName="h-16 w-16" />
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-5" aria-label="قائمة الجوال">
                {navLinks.map((link) => (
                  <NavItem
                    key={link.label}
                    to={link.to}
                    label={link.label}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
                <Link
                  to="/admin/login"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-mocha hover:text-brown"
                >
                  حسابي
                </Link>
              </nav>
              <div className="mt-10 border-t border-taupe/30 pt-6 text-sm text-mocha">
                أناقة تترك أثراً
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/" aria-label="أثر — الصفحة الرئيسية">
            <BrandLogo priority imgClassName="h-12 w-12" />
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={searchOpen ? 'إغلاق البحث' : 'بحث'}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <X /> : <Search />}
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative" aria-label="سلة التسوق">
              <Link to="/cart">
                <ShoppingBag />
                {itemCount > 0 ? (
                  <span className="absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-espresso">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          </div>
        </div>

        {searchOpen ? (
          <div className="pb-4 md:hidden lg:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
              <Input
                autoFocus
                type="search"
                placeholder="ابحث في أثر..."
                className="h-11 pe-3 ps-9"
                aria-label="بحث"
              />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}
