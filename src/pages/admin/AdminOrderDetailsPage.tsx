import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import {
  ORDER_STATUS_LABELS,
  customerWhatsAppUrl,
  formatAdminDateTime,
  getAllowedStatusTransitions,
  isTerminalOrderStatus,
  orderStatusBadgeVariant,
} from '@/lib/orderStatus'
import { formatPrice } from '@/lib/utils'
import {
  adminGetOrderById,
  adminUpdateOrderStatus,
  type AdminOrderDetail,
} from '@/services/orderService'
import type { OrderStatus } from '@/types'
import { toast } from 'sonner'

export function AdminOrderDetailsPage() {
  const { id } = useParams()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const data = await adminGetOrderById(id)
      setOrder(data)
      setError(null)
      if (!data) setError('هذا الطلب لم يعد متاحًا.')
    } catch (err) {
      setOrder(null)
      setError(getErrorMessage(err, 'تعذر تحميل تفاصيل الطلب.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function applyStatus(status: OrderStatus) {
    if (!order) return
    setSaving(true)
    try {
      const updated = await adminUpdateOrderStatus(order.id, status)
      setOrder(updated)
      toast.success('تم تحديث حالة الطلب')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر تحديث حالة الطلب.'))
    } finally {
      setSaving(false)
      setCancelOpen(false)
      setPendingStatus(null)
    }
  }

  function requestStatusChange(status: OrderStatus) {
    if (!order || status === order.status) return
    if (status === 'cancelled') {
      setPendingStatus(status)
      setCancelOpen(true)
      return
    }
    void applyStatus(status)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-danger">{error ?? 'هذا الطلب لم يعد متاحًا.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/orders">رجوع للطلبات</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => void load()}>
            إعادة المحاولة
          </Button>
        </div>
      </div>
    )
  }

  const allowed = getAllowedStatusTransitions(order.status)
  const whatsappUrl = customerWhatsAppUrl(order.phone)
  const terminal = isTerminalOrderStatus(order.status)

  return (
    <>
      <PageMeta title={`طلب ${order.reference}`} noIndex />
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-gold-deep">تفاصيل الطلب</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{order.reference}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={orderStatusBadgeVariant(order.status)}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              <span className="text-xs text-mocha">
                أُنشئ {formatAdminDateTime(order.created_at)}
              </span>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/orders">رجوع</Link>
          </Button>
        </div>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">بيانات العميلة</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">الاسم</dt>
              <dd className="font-medium">{order.customer_name}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dt className="text-mocha">الهاتف</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${order.phone}`}
                  className="font-medium text-brown underline-offset-2 hover:underline"
                  dir="ltr"
                  aria-label={`اتصال بـ ${order.phone}`}
                >
                  {order.phone}
                </a>
                {whatsappUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      واتساب
                    </a>
                  </Button>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-mocha">العنوان</dt>
              <dd className="text-end leading-7">{order.address}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">ملاحظات</dt>
              <dd className="text-end">{order.notes?.trim() ? order.notes : '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">ملخص الطلب</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">رقم الطلب</dt>
              <dd dir="ltr">{order.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">تاريخ الإنشاء</dt>
              <dd>{formatAdminDateTime(order.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">آخر تحديث</dt>
              <dd>{formatAdminDateTime(order.updated_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-mocha">المجموع الفرعي</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>الإجمالي</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>

          <Separator className="my-5" />

          <h3 className="text-sm font-medium text-brown">تحديث الحالة</h3>
          {terminal ? (
            <p className="mt-2 text-sm text-mocha">
              هذا الطلب في حالة نهائية ({ORDER_STATUS_LABELS[order.status]}) ولا يمكن تغييره.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={orderStatusBadgeVariant(order.status)} className="self-center">
                الحالي: {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              {allowed.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={status === 'cancelled' ? 'outline' : 'default'}
                  disabled={saving}
                  aria-label={`تغيير الحالة إلى ${ORDER_STATUS_LABELS[status]}`}
                  onClick={() => requestStatusChange(status)}
                >
                  {ORDER_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          )}
          {saving ? (
            <p className="mt-3 text-xs text-mocha" aria-live="polite">
              جاري تحديث الحالة...
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-taupe/40 bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">عناصر الطلب</h2>
          <p className="mt-1 text-xs text-mocha">
            الأسعار والأسماء محفوظة كما كانت وقت الطلب.
          </p>
          <ul className="mt-4 space-y-4">
            {order.items.length === 0 ? (
              <li className="text-sm text-mocha">لا توجد عناصر مسجّلة لهذا الطلب.</li>
            ) : (
              order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 border-b border-taupe/25 pb-4 last:border-0 last:pb-0"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-md bg-mist sm:size-20">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-brown/25">
                        أثر
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-7">{item.product_name}</p>
                    <p className="mt-1 text-xs text-mocha">
                      {formatPrice(item.unit_price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatPrice(item.subtotal)}</p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-cream sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد إلغاء الطلب</DialogTitle>
            <DialogDescription>
              هل أنتِ متأكدة من إلغاء الطلب {order.reference}؟ لا يمكن التراجع عن هذه الخطوة من
              لوحة الإدارة بسهولة.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setCancelOpen(false)
                setPendingStatus(null)
              }}
            >
              تراجع
            </Button>
            <Button
              type="button"
              disabled={saving || pendingStatus !== 'cancelled'}
              onClick={() => void applyStatus('cancelled')}
            >
              {saving ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
