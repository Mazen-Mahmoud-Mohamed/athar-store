import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { adminGetOrders } from '@/services/orderService'
import type { Order, OrderStatus } from '@/types'

const statusLabel: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await adminGetOrders()
        if (!active) return
        setOrders(data)
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل الطلبات'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageMeta title="إدارة الطلبات" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">الطلبات</h1>
          <p className="mt-2 text-sm text-mocha">متابعة طلبات عميلات أثر</p>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-taupe/40 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-mist/80 text-mocha">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">رقم الطلب</th>
                  <th className="px-4 py-3 text-start font-medium">العميلة</th>
                  <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-mocha">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-mocha">
                      لا توجد طلبات بعد.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-t border-taupe/30">
                      <td className="px-4 py-3 font-mono text-xs">{order.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">{order.customer_name}</td>
                      <td className="px-4 py-3">{formatPrice(order.total)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="soft">{statusLabel[order.status]}</Badge>
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
      </div>
    </>
  )
}
