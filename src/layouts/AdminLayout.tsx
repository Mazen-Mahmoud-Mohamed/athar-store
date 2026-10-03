import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
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

export function AdminLayout() {
  const navigate = useNavigate()
  const { signOut, profile } = useAuth()

  async function handleSignOut() {
    try {
      await signOut()
      toast.message('تم تسجيل الخروج')
      navigate('/admin/login', { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'فشل تسجيل الخروج'))
    }
  }

  return (
    <div className="min-h-dvh bg-mist text-brown">
      <div className="border-b border-taupe/40 bg-card">
        <div className="container-athar flex h-16 items-center justify-between gap-4">
          <Link to="/admin" className="flex items-center gap-3">
            <BrandLogo imgClassName="h-10 w-10" />
            <div>
              <p className="font-display text-sm font-semibold">أثر</p>
              <p className="text-[11px] text-mocha">
                لوحة الإدارة{profile?.full_name ? ` · ${profile.full_name}` : ''}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-mocha transition hover:text-brown">
              العودة للمتجر
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              خروج
            </Button>
          </div>
        </div>
      </div>

      <div className="container-athar grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-lg border border-taupe/40 bg-card p-4">
          <nav className="flex flex-col gap-1" aria-label="قائمة الإدارة">
            {adminLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'bg-brown text-cream'
                      : 'text-mocha hover:bg-mist hover:text-brown',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  )
}
