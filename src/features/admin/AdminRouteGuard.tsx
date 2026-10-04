import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/admin/AuthProvider'

export function AdminRouteGuard() {
  const { configured, loading, session, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-mist text-sm text-mocha">
        جاري التحقق من الجلسة...
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-mist px-4">
        <div className="max-w-md rounded-xl border border-taupe/40 bg-card p-8 text-center shadow-soft">
          <h1 className="font-display text-xl font-semibold text-brown">لوحة التحكم غير جاهزة</h1>
          <p className="mt-3 text-sm leading-7 text-mocha">
            تعذر الاتصال بخدمات المتجر حالياً. تواصلي مع الدعم الفني لإعداد لوحة التحكم.
          </p>
        </div>
      </div>
    )
  }

  if (!session || !isAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
