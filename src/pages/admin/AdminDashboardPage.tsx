import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import {
  ORDER_STATUS_LABELS,
  formatAdminDateTime,
  orderStatusBadgeVariant,
} from '@/lib/orderStatus'
import { formatPrice } from '@/lib/utils'
import {
  adminGetOrderCounts,
  adminListOrders,
  type AdminOrderListItem,
} from '@/services/orderService'
import { adminGetAllProducts } from '@/services/productService'

export function AdminDashboardPage() {
  const [stats, setStats] = useState({
    products: 0,
    available: 0,
    pending: 0,
    orders: 0,
  })
  const [attentionOrders, setAttentionOrders] = useState<AdminOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [products, orderCounts, pending] = await Promise.all([
          adminGetAllProducts(),
          adminGetOrderCounts(),
          adminListOrders({ page: 1, pageSize: 6, status: 'pending' }),
        ])
        if (!active) return
        setStats({
          products: products.length,
          available: products.filter((p) => p.is_active && p.stock_quantity > 0).length,
          pending: orderCounts.pending,
          orders: orderCounts.total,
        })
        setAttentionOrders(pending.orders)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل لوحة التحكم'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const cards = [
    { label: 'إجمالي المنتجات', value: stats.products, to: '/admin/products' },
    { label: 'المنتجات المتاحة', value: stats.available, to: '/admin/products' },
    { label: 'الطلبات الجديدة', value: stats.pending, to: '/admin/orders' },
    { label: 'إجمالي الطلبات', value: stats.orders, to: '/admin/orders' },
  ]

  return (
    <>
      <PageMeta title="لوحة التحكم" path="/admin" noIndex />
      <div className="space-y-8">
        <AdminPageHeader
          title="لوحة التحكم"
          description="نظرة سريعة على متجرك وطلباتك"
        />

        {error ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))
            : cards.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.to}
                  className="rounded-xl border border-taupe/40 bg-card p-5 transition hover:border-gold/40 hover:shadow-soft"
                >
                  <p className="text-sm text-mocha">{stat.label}</p>
                  <p className="mt-3 font-display text-3xl font-semibold tabular-nums">
                    {stat.value}
                  </p>
                </Link>
              ))}
        </div>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">إجراءات سريعة</h2>
          <p className="mt-1 text-sm text-mocha">الوصول السريع لأكثر المهام استخداماً</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild className="h-12">
              <Link to="/admin/products/new">+ إضافة منتج</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link to="/admin/products">إدارة المنتجات</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link to="/admin/categories">إدارة التصنيفات</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link to="/admin/orders">مشاهدة الطلبات</Link>
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">طلبات تحتاج إلى متابعة</h2>
              <p className="mt-1 text-sm text-mocha">الطلبات الجديدة التي لم تُعالَج بعد</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/orders">كل الطلبات</Link>
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : attentionOrders.length === 0 ? (
            <AdminEmptyState title="لا توجد طلبات تحتاج إلى متابعة حاليًا" />
          ) : (
            <ul className="divide-y divide-taupe/30">
              {attentionOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm transition hover:bg-mist/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium tracking-wide" dir="ltr">
                        {order.reference}
                      </p>
                      <p className="mt-1 text-xs text-mocha">
                        {order.customer_name} · {formatAdminDateTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={orderStatusBadgeVariant(order.status)}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      <span className="font-semibold">{formatPrice(order.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
