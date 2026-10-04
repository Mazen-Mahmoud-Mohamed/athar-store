import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Store } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuth } from '@/features/admin/AuthProvider'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const adminLinks = [
  { to: '/admin', label: 'لوحة التحكم', end: true },
  { to: '/admin/products', label: 'المنتجات' },
  { to: '/admin/categories', label: 'التصنيفات' },
  { to: '/admin/orders', label: 'الطلبات' },
]

function AdminNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="قائمة الإدارة">
      {adminLinks.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brown text-cream shadow-soft'
                : 'text-mocha hover:bg-mist hover:text-brown',
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const { signOut, profile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    try {
      await signOut()
      toast.message('تم تسجيل الخروج')
      navigate('/admin/login', { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر تسجيل الخروج'))
    }
  }

  return (
    <div className="min-h-dvh bg-mist text-brown">
      <header className="sticky top-0 z-30 border-b border-taupe/40 bg-card/95 backdrop-blur-sm">
        <div className="container-athar flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="فتح قائمة الإدارة"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-card">
                <SheetHeader className="text-start">
                  <SheetTitle>قائمة الإدارة</SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex h-[calc(100%-4rem)] flex-col">
                  <AdminNav onNavigate={() => setMobileOpen(false)} />
                  <div className="mt-auto space-y-2 border-t border-taupe/30 pt-4">
                    <Button asChild variant="outline" className="w-full justify-start gap-2">
                      <Link to="/" onClick={() => setMobileOpen(false)}>
                        <Store className="size-4" />
                        العودة للمتجر
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start gap-2 text-mocha"
                      onClick={() => void handleSignOut()}
                    >
                      <LogOut className="size-4" />
                      تسجيل الخروج
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/admin" className="flex items-center gap-3">
              <BrandLogo imgClassName="h-10 w-10" />
              <div>
                <p className="font-display text-sm font-semibold">أثر</p>
                <p className="text-[11px] text-mocha">
                  لوحة التحكم
                  {profile?.full_name ? ` · ${profile.full_name}` : ''}
                </p>
              </div>
            </Link>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">العودة للمتجر</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-3.5" />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </header>

      <div className="container-athar grid gap-6 py-6 lg:grid-cols-[240px_1fr] lg:gap-8 lg:py-8">
        <aside className="hidden h-fit flex-col rounded-xl border border-taupe/40 bg-card p-4 lg:flex">
          <p className="mb-3 px-3 text-[11px] font-medium tracking-wide text-mocha/80">
            الأقسام
          </p>
          <AdminNav />
          <div className="mt-8 space-y-2 border-t border-taupe/30 pt-4">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
              <Link to="/">
                <Store className="size-4" />
                العودة للمتجر
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-mocha"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </Button>
          </div>
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
