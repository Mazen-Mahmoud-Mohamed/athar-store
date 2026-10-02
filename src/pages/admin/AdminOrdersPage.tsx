import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatOrderReference } from '@/lib/checkoutValidation'
import { getErrorMessage } from '@/lib/errors'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  formatAdminDateTime,
  orderStatusBadgeVariant,
} from '@/lib/orderStatus'
import { formatPrice } from '@/lib/utils'
import {
  adminGetOrderCounts,
  adminListOrders,
  type AdminOrderCounts,
  type AdminOrderListItem,
} from '@/services/orderService'
import type { OrderStatus } from '@/types'

const PAGE_SIZE = 20

const summaryCards: Array<{ key: keyof AdminOrderCounts; label: string }> = [
  { key: 'total', label: 'إجمالي الطلبات' },
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'preparing', label: 'جاري التجهيز' },
  { key: 'delivered', label: 'تم التسليم' },
  { key: 'cancelled', label: 'ملغي' },
]

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([])
  const [counts, setCounts] = useState<AdminOrderCounts | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, summary] = await Promise.all([
        adminListOrders({
          page,
          pageSize: PAGE_SIZE,
          status: statusFilter,
          search,
        }),
        adminGetOrderCounts(),
      ])
      setOrders(list.orders)
      setTotal(list.total)
      setCounts(summary)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تحميل الطلبات.'))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 350)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const emptyMessage =
    search || statusFilter !== 'all'
      ? 'لا توجد نتائج مطابقة للبحث أو التصفية.'
      : 'لا توجد طلبات حتى الآن.'

  return (
    <>
      <PageMeta title="إدارة الطلبات" noIndex />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">الطلبات</h1>
          <p className="mt-2 text-sm text-mocha">متابعة طلبات عميلات أثر وإدارة حالاتها</p>
        </div>

        {counts ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summaryCards.map((card) => (
              <div
                key={card.key}
                className="rounded-xl border border-taupe/40 bg-card px-4 py-3"
              >
                <p className="text-xs text-mocha">{card.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {counts[card.key]}
                </p>
              </div>
            ))}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو رقم الطلب..."
            className="sm:max-w-sm"
            aria-label="بحث في الطلبات"
          />
          <p className="text-xs text-mocha" aria-live="polite">
            {total} طلب
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب الحالة">
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            onClick={() => {
              setStatusFilter('all')
              setPage(1)
            }}
          >
            الكل
          </Button>
          {ORDER_STATUSES.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => {
                setStatusFilter(status)
                setPage(1)
              }}
            >
              {ORDER_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        {error ? (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : null}

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-xl border border-taupe/40 bg-card md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-mist/80 text-mocha">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">رقم الطلب</th>
                  <th className="px-4 py-3 text-start font-medium">العميلة</th>
                  <th className="px-4 py-3 text-start font-medium">الهاتف</th>
                  <th className="px-4 py-3 text-start font-medium">العناصر</th>
                  <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium">تاريخ الإنشاء</th>
                  <th className="px-4 py-3 text-start font-medium">آخر تحديث</th>
                  <th className="px-4 py-3 text-start font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-taupe/30">
                      <td colSpan={9} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-mocha">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-t border-taupe/30">
                      <td className="px-4 py-3">
                        <span className="font-medium tracking-wide" dir="ltr">
                          {order.reference || formatOrderReference(order.id)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{order.customer_name}</td>
                      <td className="px-4 py-3" dir="ltr">
                        {order.phone}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{order.item_count}</td>
                      <td className="px-4 py-3">{formatPrice(order.total)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={orderStatusBadgeVariant(order.status)}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-mocha">
                        {formatAdminDateTime(order.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-mocha">
                        {formatAdminDateTime(order.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/admin/orders/${order.id}`}>التفاصيل</Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-taupe/45 bg-card px-4 py-10 text-center text-sm text-mocha">
              {emptyMessage}
            </div>
          ) : (
            orders.map((order) => (
              <article
                key={order.id}
                className="rounded-xl border border-taupe/40 bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium tracking-wide" dir="ltr">
                      {order.reference || formatOrderReference(order.id)}
                    </p>
                    <p className="mt-1 text-sm">{order.customer_name}</p>
                    <p className="mt-1 text-xs text-mocha" dir="ltr">
                      {order.phone}
                    </p>
                  </div>
                  <Badge variant={orderStatusBadgeVariant(order.status)}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-mocha">{order.item_count} عنصر</span>
                  <span className="font-semibold">{formatPrice(order.total)}</span>
                </div>
                <p className="mt-2 text-xs text-mocha">
                  {formatAdminDateTime(order.created_at)}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link to={`/admin/orders/${order.id}`}>عرض التفاصيل</Link>
                </Button>
              </article>
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </Button>
            <p className="text-xs text-mocha">
              صفحة {page} من {totalPages}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}
