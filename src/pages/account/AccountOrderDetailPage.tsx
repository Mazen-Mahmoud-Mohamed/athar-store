import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { getCustomerOrder, cancelCustomerOrder } from '@/services/customerService'
import {
  ORDER_STATUS_LABELS,
  orderStatusBadgeVariant,
  formatAdminDateTime,
} from '@/lib/orderStatus'
import { formatPrice } from '@/lib/utils'
import { catalogImageProps } from '@/lib/imageUrl'
import type { AdminOrderDetail } from '@/services/orderService'
import type { OrderStatus } from '@/types'

const STATUS_BG: Record<string, string> = {
  urgent:  'bg-amber-100 text-amber-800',
  gold:    'bg-yellow-100 text-yellow-800',
  soft:    'bg-blue-100 text-blue-800',
  outline: 'bg-green-100 text-green-800',
  danger:  'bg-red-100 text-red-800',
  default: 'bg-mist text-brown',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod:  'الدفع عند الاستلام',
  xpay: 'الدفع الإلكتروني (XPay)',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending:            'في الانتظار',
  requires_action:    'يتطلب إجراء',
  successful:         'تم الدفع',
  failed:             'فشل الدفع',
  cancelled:          'ملغي',
  refunded:           'مُستردّ',
  partially_refunded: 'مُستردّ جزئياً',
  expired:            'منتهي الصلاحية',
}

// Order progress timeline steps
const TIMELINE: { status: OrderStatus; label: string; icon: string }[] = [
  { status: 'pending',   label: 'استلام الطلب',   icon: '📋' },
  { status: 'confirmed', label: 'تأكيد الطلب',    icon: '✅' },
  { status: 'preparing', label: 'جارٍ التجهيز',   icon: '📦' },
  { status: 'shipped',   label: 'تم الشحن',       icon: '🚚' },
  { status: 'delivered', label: 'تم التسليم',     icon: '🎉' },
]

const STATUS_ORDER: Record<OrderStatus, number> = {
  pending:   0,
  confirmed: 1,
  preparing: 2,
  shipped:   3,
  delivered: 4,
  cancelled: -1,
}

function canCancelOrder(order: AdminOrderDetail): boolean {
  if (order.cancellation_requested_at) return false
  if (order.status === 'cancelled') return false
  if (order.status !== 'pending') return false
  return true
}

export function AccountOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)

  useEffect(() => {
    if (!id) { setError('رقم الطلب غير صحيح.'); setLoading(false); return }
    let active = true
    getCustomerOrder(id)
      .then((data) => {
        if (!active) return
        if (!data) { setError('الطلب غير موجود أو لا تملكين صلاحية الوصول إليه.') }
        else { setOrder(data) }
        setLoading(false)
      })
      .catch(() => {
        if (active) { setError('تعذر تحميل تفاصيل الطلب. حاولي مرة أخرى.'); setLoading(false) }
      })
    return () => { active = false }
  }, [id])

  async function handleCancel() {
    if (!id || cancelling) return
    setCancelling(true)
    setCancelError('')
    try {
      await cancelCustomerOrder(id)
      // Reload order after cancellation
      const updated = await getCustomerOrder(id)
      if (updated) setOrder(updated)
      setCancelConfirm(false)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'تعذر إلغاء الطلب. حاولي مرة أخرى.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="container-athar py-10" dir="rtl">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container-athar py-10" dir="rtl">
        <p role="alert" className="mb-4 rounded-xl bg-danger/5 p-4 text-sm text-danger">
          {error || 'الطلب غير موجود.'}
        </p>
        <Button asChild variant="outline">
          <Link to="/account">العودة لطلباتي</Link>
        </Button>
      </div>
    )
  }

  const badgeVariant = orderStatusBadgeVariant(order.status)
  const badgeCls = STATUS_BG[badgeVariant] ?? STATUS_BG.default
  const currentStep = STATUS_ORDER[order.status]
  const isCancelled = order.status === 'cancelled'
  const cancellable = canCancelOrder(order)
  const shortRef = order.id.replace(/-/g, '').slice(0, 6).toUpperCase()

  return (
    <div className="container-athar py-10 sm:py-14" dir="rtl">
      <PageMeta title={`تفاصيل الطلب #${shortRef} — أثر`} path={`/account/orders/${order.id}`} noIndex />

      {/* Back + title */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/account">← طلباتي</Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold">
          طلب #{shortRef}
        </h1>
        <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${badgeCls}`}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">

        {/* Left column */}
        <div className="space-y-6">

          {/* Timeline */}
          {!isCancelled && (
            <section className="rounded-2xl border border-taupe/30 bg-card p-5">
              <h2 className="mb-4 font-semibold text-brown">تتبع الطلب</h2>
              <ol className="relative border-r-2 border-taupe/30 pr-5 space-y-4">
                {TIMELINE.map((step) => {
                  const done = currentStep >= STATUS_ORDER[step.status]
                  const active = currentStep === STATUS_ORDER[step.status]
                  return (
                    <li key={step.status} className="relative">
                      <span
                        className={`absolute -end-[1.65rem] flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs
                          ${done
                            ? 'border-gold bg-gold text-espresso'
                            : 'border-taupe/40 bg-card text-mocha'
                          }`}
                        aria-hidden="true"
                      >
                        {step.icon}
                      </span>
                      <p className={`text-sm ${done ? 'font-medium text-brown' : 'text-mocha'} ${active ? 'text-gold-deep' : ''}`}>
                        {step.label}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {isCancelled && (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
              <p className="font-medium text-danger">تم إلغاء هذا الطلب.</p>
              {order.cancellation_requested_at && (
                <p className="mt-1 text-sm text-mocha">
                  تاريخ طلب الإلغاء: {formatAdminDateTime(order.cancellation_requested_at)}
                </p>
              )}
            </div>
          )}

          {/* Cancellation pending notice */}
          {order.cancellation_requested_at && !isCancelled && (
            <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-700">
                ⚠ تم طلب إلغاء الطلب وجارٍ مراجعته من قِبل فريق أثر.
              </p>
              <p className="mt-1 text-xs text-amber-600">
                لن تتم استعادة المبلغ تلقائياً للطلبات الإلكترونية. سنتواصل معكِ.
              </p>
            </div>
          )}

          {/* Products */}
          <section className="rounded-2xl border border-taupe/30 bg-card p-5">
            <h2 className="mb-4 font-semibold text-brown">المنتجات</h2>
            <ul className="space-y-4">
              {order.items.map((item) => {
                const thumb = item.image_url ? catalogImageProps(item.image_url, 'thumb') : null
                return (
                  <li key={item.id} className="flex gap-3 text-sm">
                    <div className="size-16 shrink-0 overflow-hidden rounded-md bg-mist">
                      {thumb ? (
                        <img
                          src={thumb.src}
                          srcSet={thumb.srcSet}
                          sizes={thumb.sizes}
                          alt=""
                          width={thumb.width}
                          height={thumb.height}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-display text-brown/25">أثر</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-brown">{item.product_name}</p>
                      <p className="mt-0.5 text-xs text-mocha">
                        {formatPrice(item.unit_price)} × {item.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium">{formatPrice(item.subtotal)}</p>
                  </li>
                )
              })}
            </ul>
            <Separator className="my-4" />
            <div className="flex justify-between text-sm">
              <span className="text-mocha">المجموع الفرعي</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="mt-2 flex justify-between font-semibold">
              <span>الإجمالي</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Order info */}
          <section className="rounded-2xl border border-taupe/30 bg-card p-5 text-sm">
            <h2 className="mb-3 font-semibold text-brown">تفاصيل الطلب</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-mocha">رقم الطلب</dt>
                <dd className="font-mono text-brown">#{shortRef}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mocha">التاريخ</dt>
                <dd>{formatAdminDateTime(order.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mocha">طريقة الدفع</dt>
                <dd>{order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method : '—'}</dd>
              </div>
              {order.payment_status && (
                <div className="flex justify-between gap-2">
                  <dt className="text-mocha">حالة الدفع</dt>
                  <dd>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Delivery info */}
          <section className="rounded-2xl border border-taupe/30 bg-card p-5 text-sm">
            <h2 className="mb-3 font-semibold text-brown">بيانات التوصيل</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-mocha">الاسم</dt>
                <dd className="text-end">{order.customer_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-mocha">الهاتف</dt>
                <dd dir="ltr" className="text-end">{order.phone}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-mocha">العنوان</dt>
                <dd className="text-end">{order.address}</dd>
              </div>
              {order.notes && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-mocha">ملاحظات</dt>
                  <dd className="text-end">{order.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Cancel section */}
          {cancellable && (
            <section className="rounded-2xl border border-taupe/30 bg-card p-5">
              <h2 className="mb-2 font-semibold text-brown">إلغاء الطلب</h2>
              <p className="mb-3 text-xs leading-6 text-mocha">
                يمكنكِ إلغاء الطلب قبل أن يتم تأكيده من قِبل الفريق.
                {order.payment_method === 'xpay'
                  ? ' للطلبات المدفوعة إلكترونياً سيتم التواصل معكِ لترتيب الاسترداد.'
                  : ''}
              </p>
              {cancelError && (
                <p role="alert" className="mb-3 text-xs text-danger">{cancelError}</p>
              )}
              {!cancelConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-danger/40 text-danger hover:bg-danger/5"
                  onClick={() => setCancelConfirm(true)}
                >
                  طلب إلغاء الطلب
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-brown">هل أنتِ متأكدة من إلغاء الطلب؟</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-danger/40 text-danger hover:bg-danger/5"
                      disabled={cancelling}
                      onClick={() => void handleCancel()}
                    >
                      {cancelling ? 'جارٍ الإلغاء…' : 'نعم، إلغاء الطلب'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelling}
                      onClick={() => setCancelConfirm(false)}
                    >
                      تراجع
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          <Button asChild variant="ghost" className="w-full">
            <Link to="/account">العودة لطلباتي</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
