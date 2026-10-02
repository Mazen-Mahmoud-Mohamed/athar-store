import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { CatalogEmpty } from '@/features/catalog/CatalogStates'
import { useCart } from '@/features/cart/cart-context'
import { validateCartForCheckout } from '@/lib/cartValidation'
import {
  type CheckoutFieldErrors,
  validateCheckoutPayload,
} from '@/lib/checkoutValidation'
import { getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { createOrder } from '@/services/orderService'
import { toast } from 'sonner'

export function CheckoutPage() {
  const navigate = useNavigate()
  const formId = useId()
  const { items, subtotal, replaceItems, clearCart } = useCart()
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({})
  const [cartMessages, setCartMessages] = useState<string[]>([])
  const [needsReview, setNeedsReview] = useState(false)
  const [checkingCart, setCheckingCart] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const applyCartValidation = useCallback(
    async (sourceItems = items) => {
      const result = await validateCartForCheckout(sourceItems)
      const identityChanged =
        result.syncedItems.length !== sourceItems.length ||
        result.syncedItems.some((synced) => {
          const current = sourceItems.find((item) => item.productId === synced.productId)
          return (
            !current ||
            synced.price !== current.price ||
            synced.quantity !== current.quantity ||
            synced.name !== current.name
          )
        }) ||
        sourceItems.some(
          (item) => !result.syncedItems.some((synced) => synced.productId === item.productId),
        )

      if (identityChanged) {
        replaceItems(result.syncedItems)
      }

      if (!result.ok || result.messages.length > 0) {
        setCartMessages(result.messages)
        setNeedsReview(true)
      }

      return result
    },
    [items, replaceItems],
  )

  useEffect(() => {
    let active = true
    async function run() {
      if (items.length === 0) {
        setCheckingCart(false)
        return
      }
      setCheckingCart(true)
      try {
        await applyCartValidation()
      } finally {
        if (active) setCheckingCart(false)
      }
    }
    void run()
    return () => {
      active = false
    }
    // Initial checkout landing validation only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (items.length === 0 && !submitting) {
    return (
      <>
        <PageMeta
          title="إتمام الطلب"
          description="أكملي طلبك من أثر."
          path="/checkout"
          noIndex
        />
        <div className="container-athar py-16">
          <CatalogEmpty
            title="لا توجد منتجات لإتمام الطلب"
            description="أضيفي قطعة إلى السلة ثم عودي لإتمام الطلب."
            actionLabel="تسوقي المنتجات"
            actionTo="/products"
          />
        </div>
      </>
    )
  }

  function focusFirstError(errors: CheckoutFieldErrors) {
    if (errors.customerName) nameRef.current?.focus()
    else if (errors.phone) phoneRef.current?.focus()
    else if (errors.address) addressRef.current?.focus()
    else if (errors.notes) notesRef.current?.focus()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current || submitting || needsReview) return

    const validated = validateCheckoutPayload({
      customerName,
      phone,
      address,
      notes,
    })

    if (!validated.ok) {
      setFieldErrors(validated.errors)
      focusFirstError(validated.errors)
      toast.error('من فضلك تأكدي من بيانات الطلب.')
      return
    }

    setFieldErrors({})
    submitLock.current = true
    setSubmitting(true)

    try {
      const cartCheck = await applyCartValidation(items)
      if (!cartCheck.ok) {
        toast.error(
          cartCheck.messages[0] ??
            'تم تحديث السلة. راجعي المنتجات ثم أكّدي الطلب مرة أخرى.',
        )
        return
      }

      const confirmation = await createOrder(validated.payload, cartCheck.syncedItems)
      clearCart()
      toast.success('تم استلام طلبك بنجاح')
      navigate('/order-success', { state: { confirmation }, replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.'))
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta
        title="إتمام الطلب"
        description="أدخلي بيانات التوصيل لإتمام طلبك من أثر."
        path="/checkout"
        noIndex
      />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">الدفع عند الاستلام</p>
          <h1 className="font-display text-3xl font-semibold">إتمام الطلب</h1>
          <p className="mt-2 text-sm text-mocha">
            أدخلي بياناتك وسنؤكد الطلب عبر الهاتف أو واتساب.
          </p>
        </div>

        {needsReview ? (
          <div
            className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm leading-7 text-brown"
            role="alert"
          >
            <p className="font-medium">تم تحديث السلة — راجعي التفاصيل قبل التأكيد:</p>
            {cartMessages.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pe-5">
                {cartMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/cart">مراجعة السلة</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setNeedsReview(false)
                  setCartMessages([])
                }}
              >
                راجعتُ التحديثات، متابعة
              </Button>
            </div>
          </div>
        ) : null}

        <form
          id={formId}
          onSubmit={onSubmit}
          noValidate
          className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="space-y-5 rounded-xl border border-taupe/30 bg-card p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">بيانات التوصيل</h2>

            <div className="space-y-2">
              <Label htmlFor="customerName">الاسم بالكامل</Label>
              <Input
                ref={nameRef}
                id="customerName"
                name="customerName"
                autoComplete="name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسمكِ الكريم"
                aria-invalid={Boolean(fieldErrors.customerName)}
                aria-describedby={fieldErrors.customerName ? 'customerName-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.customerName ? (
                <p id="customerName-error" className="text-xs text-danger" role="alert">
                  {fieldErrors.customerName}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                ref={phoneRef}
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                dir="ltr"
                className="text-start"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.phone ? (
                <p id="phone-error" className="text-xs text-danger" role="alert">
                  {fieldErrors.phone}
                </p>
              ) : (
                <p className="text-xs text-mocha">رقم تواصلكِ — وليس رقم متجر أثر.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">العنوان بالتفصيل</Label>
              <Textarea
                ref={addressRef}
                id="address"
                name="address"
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="المحافظة، المدينة، الشارع، رقم المبنى، علامة مميزة"
                aria-invalid={Boolean(fieldErrors.address)}
                aria-describedby={fieldErrors.address ? 'address-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.address ? (
                <p id="address-error" className="text-xs text-danger" role="alert">
                  {fieldErrors.address}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Textarea
                ref={notesRef}
                id="notes"
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي تفاصيل إضافية للتوصيل"
                maxLength={500}
                aria-invalid={Boolean(fieldErrors.notes)}
                aria-describedby={fieldErrors.notes ? 'notes-error' : 'notes-hint'}
                disabled={submitting}
              />
              {fieldErrors.notes ? (
                <p id="notes-error" className="text-xs text-danger" role="alert">
                  {fieldErrors.notes}
                </p>
              ) : (
                <p id="notes-hint" className="text-xs text-mocha">
                  {notes.trim().length}/500
                </p>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-xl border border-taupe/30 bg-card p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold">ملخص الطلب</h2>
            <ul className="mt-4 space-y-4">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3 text-sm">
                  <div className="size-16 shrink-0 overflow-hidden rounded-md bg-mist">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
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
                    <p className="font-medium text-brown">{item.name}</p>
                    <p className="mt-1 text-xs text-mocha">
                      {formatPrice(item.price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium">{formatPrice(item.price * item.quantity)}</p>
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-mocha">المجموع الفرعي</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>الإجمالي</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs leading-6 text-mocha">
                السعر النهائي يُؤكد من الخادم عند إرسال الطلب.
              </p>
            </div>

            <Button
              type="submit"
              className="mt-6 w-full"
              size="lg"
              disabled={submitting || checkingCart || needsReview || items.length === 0}
              aria-busy={submitting}
            >
              {submitting ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب'}
            </Button>

            {needsReview ? (
              <p className="mt-3 text-center text-xs text-danger">
                راجعي تحديثات السلة أولاً قبل تأكيد الطلب.
              </p>
            ) : null}

            <Button asChild variant="ghost" className="mt-2 w-full" disabled={submitting}>
              <Link to="/cart">العودة للسلة</Link>
            </Button>
          </aside>
        </form>
      </div>
    </>
  )
}
