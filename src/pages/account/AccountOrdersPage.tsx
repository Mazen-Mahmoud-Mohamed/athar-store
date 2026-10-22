import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/admin/AuthProvider'
import { listCustomerOrders } from '@/services/customerService'
import { ORDER_STATUS_LABELS, orderStatusBadgeVariant, formatAdminDate } from '@/lib/orderStatus'
import { formatPrice } from '@/lib/utils'
import type { Order } from '@/types'

const STATUS_BG: Record<string, string> = {
  urgent:  'bg-amber-100 text-amber-800',
  gold:    'bg-yellow-100 text-yellow-800',
  soft:    'bg-blue-100 text-blue-800',
  outline: 'bg-green-100 text-green-800',
  danger:  'bg-red-100 text-red-800',
  default: 'bg-mist text-brown',
}

export function AccountOrdersPage() {
  const { user, signOut, profile } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listCustomerOrders()
      .then((data) => {
        if (active) { setOrders(data); setLoading(false) }
      })
      .catch(() => {
        if (active) { setError('تعذر تحميل الطلبات. حدّثي الصفحة وحاولي مرة أخرى.'); setLoading(false) }
      })
    return () => { active = false }
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'عزيزتي'

  return (
    <div className="container-athar py-10 sm:py-14" dir="rtl">
      <PageMeta title="حسابي — أثر" path="/account" noIndex />

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-gold-deep">أثر — حسابكِ</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">مرحباً، {displayName}</h1>
          <p className="mt-1 text-sm text-mocha">{user?.email}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/account/profile">إعدادات الحساب</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            تسجيل الخروج
          </Button>
        </div>
      </div>

      {/* Orders list */}
      <section>
        <h2 className="mb-4 font-display text-xl font-semibold">طلباتي</h2>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        )}

        {!loading && error && (
          <p role="alert" className="rounded-xl bg-danger/5 p-4 text-sm text-danger">{error}</p>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="rounded-2xl border border-taupe/30 bg-card p-8 text-center">
            <p className="text-mocha">لا توجد طلبات بعد.</p>
            <Button asChild className="mt-4">
              <Link to="/products">تسوقي الآن</Link>
            </Button>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <ul className="space-y-3">
            {orders.map((order) => {
              const badgeVariant = orderStatusBadgeVariant(order.status)
              const badgeCls = STATUS_BG[badgeVariant] ?? STATUS_BG.default
              return (
                <li key={order.id}>
                  <Link
                    to={`/account/orders/${order.id}`}
                    className="block rounded-2xl border border-taupe/30 bg-card p-5 transition hover:border-gold/50 hover:shadow-soft"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-brown">
                          طلب #{order.id.replace(/-/g, '').slice(0, 6).toUpperCase()}
                        </p>
                        <p className="mt-1 text-xs text-mocha">{formatAdminDate(order.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${badgeCls}`}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <span className="text-sm font-semibold">{formatPrice(order.total)}</span>
                      </div>
                    </div>
                    {order.cancellation_requested_at && (
                      <p className="mt-2 text-xs text-amber-600">
                        ⚠ تم طلب الإلغاء — جارٍ المراجعة من قِبل الفريق.
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
