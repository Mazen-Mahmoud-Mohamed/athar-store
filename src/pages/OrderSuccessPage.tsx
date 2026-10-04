import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { WhatsAppCta } from '@/components/ContactLinks'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { whatsappOrderFollowUpUrl } from '@/config/contact'
import { formatPrice } from '@/lib/utils'
import {
  readRememberedGuestOrderConfirmation,
  rememberGuestOrderConfirmation,
  type GuestOrderConfirmation,
} from '@/services/orderService'
import {
  clearPendingXPayPayment,
  fetchXPayPaymentStatus,
  paymentStatusLabel,
  readPendingXPayPayment,
  type PaymentStatusValue,
} from '@/services/paymentService'

type SuccessLocationState = {
  confirmation?: GuestOrderConfirmation
}

function headlineFor(
  confirmation: GuestOrderConfirmation | null,
  paymentStatus: PaymentStatusValue | 'unknown' | null,
  checkingPayment: boolean,
  leftCheckoutEarly: boolean,
) {
  if (checkingPayment) {
    return {
      title: 'جارٍ التحقق من الدفع',
      body: 'نتحقق من حالة الدفع من الخادم. قد يستغرق ذلك لحظات.',
    }
  }

  if (confirmation?.paymentMethod === 'xpay') {
    switch (paymentStatus) {
      case 'successful':
        return {
          title: 'تم الدفع بنجاح',
          body: 'تم تأكيد الدفع إلكترونيًا. شكراً لطلبكِ من أثر — سنتواصل معكِ بشأن التوصيل.',
        }
      case 'pending':
      case 'requires_action':
        return {
          title: leftCheckoutEarly ? 'لم تُكمل عملية الدفع بعد' : 'بانتظار تأكيد الدفع',
          body: leftCheckoutEarly
            ? 'خرجتِ من صفحة الدفع قبل التأكيد. لم نُسجّل دفعًا ناجحًا بعد — يمكنكِ المحاولة لاحقًا أو التواصل معنا برقم الطلب.'
            : 'عاد المتصفح من صفحة الدفع، لكن لم نؤكد استلام المبلغ بعد من الخادم. حدّثي الصفحة بعد لحظات أو تواصلي معنا برقم الطلب.',
        }
      case 'failed':
        return {
          title: 'لم يتم إتمام الدفع',
          body: 'تعذر إتمام الدفع الإلكتروني. لم يُعتبر الطلب مدفوعًا. يمكنكِ المحاولة من جديد أو اختيار الدفع عند الاستلام.',
        }
      case 'cancelled':
        return {
          title: 'تم إلغاء الدفع',
          body: 'أُلغيت عملية الدفع قبل اكتمالها. يمكنكِ إعادة المحاولة من صفحة إتمام الطلب.',
        }
      case 'expired':
        return {
          title: 'انتهت جلسة الدفع',
          body: 'انتهت صلاحية جلسة الدفع. ابدئي طلبًا جديدًا إن رغبتِ.',
        }
      case 'refunded':
      case 'partially_refunded':
        return {
          title: 'تم تحديث حالة الاسترداد',
          body: 'تم تسجيل عملية استرداد مرتبطة بهذا الطلب.',
        }
      default:
        return {
          title: 'متابعة الدفع',
          body: 'تعذر تأكيد حالة الدفع بعد. إن كان لديكِ رقم طلب، تواصلي معنا عبر واتساب.',
        }
    }
  }

  if (confirmation) {
    return {
      title: 'شكراً لطلبكِ من أثر',
      body: 'تم استلام طلبك بنجاح. سنتواصل معكِ قريباً لتأكيد التفاصيل والتوصيل.',
    }
  }

  return {
    title: 'متابعة الطلب',
    body: 'لا توجد بيانات تأكيد محفوظة لهذه الزيارة. لم يُنشأ أي طلب جديد من فتح هذه الصفحة.',
  }
}

export function OrderSuccessPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [confirmation, setConfirmation] = useState<GuestOrderConfirmation | null>(() => {
    const fromNav = (location.state as SuccessLocationState | null)?.confirmation
    if (
      fromNav &&
      typeof fromNav.reference === 'string' &&
      typeof fromNav.total === 'number' &&
      Number.isFinite(fromNav.total)
    ) {
      return fromNav
    }
    return readRememberedGuestOrderConfirmation()
  })
  const xpaySession = searchParams.get('xpay_session')
  const paymentIdParam = searchParams.get('payment_id')
  const guestTokenParam = searchParams.get('guest_token')
  const xpayCancel = searchParams.get('xpay_cancel') === '1'

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusValue | 'unknown' | null>(
    () => confirmation?.paymentStatus ?? null,
  )
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    const pending = readPendingXPayPayment()
    const paymentId = paymentIdParam || pending?.paymentId
    const guestToken = guestTokenParam || pending?.guestToken
    const sessionId = xpaySession || pending?.sessionId

    if (!paymentId || !guestToken) {
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 8

    const poll = async () => {
      setCheckingPayment(true)
      setStatusError(null)
      try {
        const result = await fetchXPayPaymentStatus({
          paymentId,
          guestToken,
          sessionId: sessionId || undefined,
        })
        if (cancelled) return

        setPaymentStatus(result.paymentStatus)
        setConfirmation(result.confirmation)
        rememberGuestOrderConfirmation(result.confirmation)

        if (
          result.paymentStatus === 'successful' ||
          result.paymentStatus === 'failed' ||
          result.paymentStatus === 'cancelled' ||
          result.paymentStatus === 'expired' ||
          result.paymentStatus === 'refunded' ||
          result.paymentStatus === 'partially_refunded'
        ) {
          clearPendingXPayPayment()
          setCheckingPayment(false)
          return
        }

        // Cancel/return query params are never authoritative — keep server status.

        attempts += 1
        if (attempts < maxAttempts) {
          window.setTimeout(() => {
            void poll()
          }, 2500)
        } else {
          setCheckingPayment(false)
        }
      } catch {
        if (cancelled) return
        setStatusError('تعذر التحقق من حالة الدفع من الخادم.')
        setPaymentStatus((prev) => prev ?? 'unknown')
        setCheckingPayment(false)
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [guestTokenParam, paymentIdParam, xpayCancel, xpaySession])

  const copy = useMemo(
    () => headlineFor(confirmation, paymentStatus, checkingPayment, xpayCancel),
    [checkingPayment, confirmation, paymentStatus, xpayCancel],
  )

  const showPaymentRow = confirmation?.paymentMethod === 'xpay' || Boolean(paymentIdParam)

  return (
    <>
      <PageMeta
        title={confirmation ? copy.title : 'متابعة الطلب'}
        description={
          confirmation
            ? copy.body
            : 'متابعة طلب أثر — لا يتم إنشاء طلب جديد عند فتح هذه الصفحة مباشرة.'
        }
        path="/order-success"
        noIndex
      />
      <div className="container-athar flex min-h-[60vh] items-center justify-center py-12 sm:py-16">
        <div className="w-full max-w-lg text-center">
          <BrandLogo imgClassName="mx-auto h-20 w-20" />
          <h1 className="mt-6 font-display text-3xl font-semibold">{copy.title}</h1>
          <p className="mt-3 text-sm leading-7 text-mocha">{copy.body}</p>

          {statusError ? (
            <p className="mt-4 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs leading-6 text-danger" role="alert">
              {statusError}
            </p>
          ) : null}

          {checkingPayment ? (
            <p className="mt-3 text-xs text-mocha" role="status" aria-live="polite">
              جارٍ التحقق الآمن من حالة الدفع…
            </p>
          ) : null}

          {confirmation ? (
            <div className="mt-8 rounded-xl border border-taupe/30 bg-card p-5 text-start sm:p-6">
              <dl className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-mocha">رقم الطلب</dt>
                  <dd className="font-semibold tracking-wide text-brown" dir="ltr">
                    {confirmation.reference}
                  </dd>
                </div>
                {confirmation.customerName ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-mocha">الاسم</dt>
                    <dd className="break-words font-medium text-brown">
                      {confirmation.customerName}
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-mocha">الإجمالي المؤكد</dt>
                  <dd className="font-semibold text-brown">{formatPrice(confirmation.total)}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-mocha">حالة الطلب</dt>
                  <dd className="text-brown">
                    {paymentStatus === 'successful' ? 'مؤكد' : 'قيد المراجعة'}
                  </dd>
                </div>
                {showPaymentRow ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-mocha">حالة الدفع</dt>
                    <dd className="text-brown">
                      {paymentStatusLabel(
                        (paymentStatus === 'unknown' ? undefined : paymentStatus) ??
                          confirmation.paymentStatus,
                      )}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {confirmation.items.length > 0 ? (
                <>
                  <Separator className="my-4" />
                  <ul className="space-y-2 text-sm">
                    {confirmation.items.map((item, index) => (
                      <li
                        key={`${item.productName}-${item.quantity}-${item.unitPrice}-${index}`}
                        className="flex justify-between gap-3"
                      >
                        <span className="min-w-0 break-words text-mocha">
                          {item.productName} × {item.quantity}
                        </span>
                        <span className="shrink-0">{formatPrice(item.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 rounded-xl border border-dashed border-taupe/45 bg-card/70 px-4 py-5 text-sm leading-7 text-mocha">
              إذا وصلتِ إلى هذه الصفحة مباشرة أو بعد تحديث المتصفح دون بيانات طلب محفوظة، فلن يُعاد
              إرسال أي طلب تلقائياً. إن كان لديكِ رقم طلب، تواصلي معنا عبر واتساب للمتابعة.
            </p>
          )}

          {confirmation ? (
            <div className="mt-8 space-y-3 text-sm leading-7 text-mocha">
              <p className="font-medium text-brown">ماذا بعد؟</p>
              {confirmation.paymentMethod === 'xpay' ? (
                paymentStatus === 'successful' ? (
                  <p>تم تأكيد الدفع إلكترونيًا. نراجع الطلب ونتواصل لتأكيد موعد التوصيل.</p>
                ) : (
                  <p>
                    لا نعتمد على مجرد العودة من صفحة الدفع. التأكيد النهائي يتم بعد التحقق من
                    الخادم/إشعار XPay.
                  </p>
                )
              ) : (
                <>
                  <p>نراجع طلبكِ ونتواصل لتأكيد التوفر وموعد التوصيل.</p>
                  <p>الدفع عند الاستلام — لم يتم تحصيل أي دفعة إلكترونية عبر الموقع.</p>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to="/products">متابعة التسوق</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">العودة للرئيسية</Link>
            </Button>
          </div>

          <div className="mt-5 flex flex-col items-center gap-3">
            {confirmation ? (
              <a
                href={whatsappOrderFollowUpUrl(confirmation.reference)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-espresso transition hover:bg-gold-soft"
              >
                متابعة الطلب عبر واتساب
              </a>
            ) : (
              <WhatsAppCta />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
