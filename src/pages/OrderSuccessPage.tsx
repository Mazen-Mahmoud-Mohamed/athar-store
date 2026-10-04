import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { WhatsAppCta } from '@/components/ContactLinks'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { whatsappOrderFollowUpUrl } from '@/config/contact'
import { formatPrice } from '@/lib/utils'
import {
  readRememberedGuestOrderConfirmation,
  type GuestOrderConfirmation,
} from '@/services/orderService'

type SuccessLocationState = {
  confirmation?: GuestOrderConfirmation
}

export function OrderSuccessPage() {
  const location = useLocation()
  const confirmation = useMemo(() => {
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
  }, [location.state])

  return (
    <>
      <PageMeta
        title={confirmation ? 'تم تأكيد الطلب' : 'متابعة الطلب'}
        description={
          confirmation
            ? 'تم استلام طلبك من أثر بنجاح.'
            : 'متابعة طلب أثر — لا يتم إنشاء طلب جديد عند فتح هذه الصفحة مباشرة.'
        }
        path="/order-success"
        noIndex
      />
      <div className="container-athar flex min-h-[60vh] items-center justify-center py-12 sm:py-16">
        <div className="w-full max-w-lg text-center">
          <BrandLogo imgClassName="mx-auto h-20 w-20" />
          {confirmation ? (
            <>
              <h1 className="mt-6 font-display text-3xl font-semibold">شكراً لطلبكِ من أثر</h1>
              <p className="mt-3 text-sm leading-7 text-mocha">
                تم استلام طلبك بنجاح. سنتواصل معكِ قريباً لتأكيد التفاصيل والتوصيل.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-6 font-display text-3xl font-semibold">متابعة الطلب</h1>
              <p className="mt-3 text-sm leading-7 text-mocha">
                لا توجد بيانات تأكيد محفوظة لهذه الزيارة. لم يُنشأ أي طلب جديد من فتح هذه الصفحة.
              </p>
            </>
          )}

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
                  <dt className="text-mocha">الحالة</dt>
                  <dd className="text-brown">قيد المراجعة</dd>
                </div>
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
              <p>نراجع طلبكِ ونتواصل لتأكيد التوفر وموعد التوصيل.</p>
              <p>الدفع عند الاستلام — لم يتم تحصيل أي دفعة إلكترونية عبر الموقع.</p>
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
