import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { adminGetOrderById, adminUpdateOrderStatus } from '@/services/orderService'
import type { Order, OrderStatus } from '@/types'
import { toast } from 'sonner'

const statuses: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
]

const statusLabel: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

export function AdminOrderDetailsPage() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!id) return
      try {
        const data = await adminGetOrderById(id)
        if (!active) return
        setOrder(data)
      } catch (error) {
        toast.error(getErrorMessage(error, 'تعذر تحميل الطلب'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id])

  async function updateStatus(status: OrderStatus) {
    if (!order) return
    setSaving(true)
    try {
      const updated = await adminUpdateOrderStatus(order.id, status)
      setOrder({ ...updated, items: order.items })
      toast.success('تم تحديث حالة الطلب')
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر تحديث الحالة'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-mocha">جاري التحميل...</p>
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-mocha">الطلب غير موجود.</p>
        <Button asChild variant="outline">
          <Link to="/admin/orders">رجوع</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageMeta title={`طلب ${order.id.slice(0, 8)}`} />
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">تفاصيل الطلب</h1>
            <p className="mt-2 font-mono text-xs text-mocha">{order.id}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/orders">رجوع</Link>
          </Button>
        </div>

        <div className="rounded-xl border border-taupe/40 bg-card p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">العميلة</dt>
              <dd>{order.customer_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">الهاتف</dt>
              <dd dir="ltr">{order.phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">العنوان</dt>
              <dd className="text-end">{order.address}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">ملاحظات</dt>
              <dd>{order.notes || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">الحالة</dt>
              <dd>{statusLabel[order.status]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">الإجمالي</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>

          <Separator className="my-5" />

          <div className="space-y-2">
            <LabelLike>تحديث الحالة</LabelLike>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={order.status === status ? 'default' : 'outline'}
                  disabled={saving || order.status === status}
                  onClick={() => void updateStatus(status)}
                >
                  {statusLabel[status]}
                </Button>
              ))}
            </div>
          </div>

          <Separator className="my-5" />

          <h2 className="mb-3 font-display text-lg font-semibold">العناصر</h2>
          <ul className="space-y-3 text-sm">
            {(order.items ?? []).map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-mocha">
                  {item.product_name} × {item.quantity}
                </span>
                <span>{formatPrice(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function LabelLike({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm font-medium text-brown">{children}</p>
}
