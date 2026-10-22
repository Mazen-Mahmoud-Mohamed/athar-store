import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/admin/AuthProvider'

export function CustomerRouteGuard() {
  const { loading, user } = useAuth()
  const location = useLocation()
  if (loading) return <p className="container-athar py-16" role="status">جارٍ التحقق من الحساب…</p>
  if (!user || !user.email_confirmed_at) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet key={user.id} />
}
