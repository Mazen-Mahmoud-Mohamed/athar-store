import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { adminGetAllCategories } from '@/services/categoryService'
import {
  adminGetOrderCounts,
  adminListOrders,
  type AdminOrderListItem,
} from '@/services/orderService'
import { adminGetAllProducts } from '@/services/productService'

export function AdminDashboardPage() {
  const [stats, setStats] = useState({
    products: 0,
    categories: 0,
    orders: 0,
    featured: 0,
    pending: 0,
  })
  const [recentOrders, setRecentOrders] = useState<AdminOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [products, categories, orderCounts, recent] = await Promise.all([
          adminGetAllProducts(),
          adminGetAllCategories(),
          adminGetOrderCounts(),
          adminListOrders({ page: 1, pageSize: 5 }),
        ])
        if (!active) return
        setStats({
          products: products.length,
          categories: categories.length,
          orders: orderCounts.total,
          featured: products.filter((p) => p.is_featured).length,
          pending: orderCounts.pending,
        })
        setRecentOrders(recent.orders)
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
    { label: 'المنتجات', value: stats.products, to: '/admin/products' },
    { label: 'التصنيفات', value: stats.categories, to: '/admin/categories' },
    { label: 'الطلبات', value: stats.orders, to: '/admin/orders' },
    { label: 'قيد المراجعة', value: stats.pending, to: '/admin/orders' },
  ]

  return (
    <>
      <PageMeta title="لوحة التحكم" path="/admin" noIndex />
      <div className="space-y-8">
        <div>
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">أثر ADMIN</p>
          <h1 className="font-display text-3xl font-semibold">لوحة التحكم</h1>
          <p className="mt-2 text-sm text-mocha">إدارة متجر أثر عبر Supabase.</p>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))
            : cards.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.to}
                  className="rounded-xl border border-taupe/40 bg-card p-5 transition hover:shadow-soft"
                >
                  <p className="text-sm text-mocha">{stat.label}</p>
                  <p className="mt-2 font-display text-3xl font-semibold">{stat.value}</p>
                </Link>
              ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/admin/products/new">إضافة منتج</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/orders">عرض الطلبات</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/categories">التصنيفات</Link>
          </Button>
        </div>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">أحدث الطلبات</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/orders">الكل</Link>
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-mocha">لا توجد طلبات حتى الآن.</p>
          ) : (
            <ul className="divide-y divide-taupe/30">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="font-medium hover:text-espresso"
                      dir="ltr"
                    >
                      {order.reference}
                    </Link>
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
