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
import { catalogImageProps } from '@/lib/imageUrl'
import { validateCartForCheckout } from '@/lib/cartValidation'
import {
  type CheckoutFieldErrors,
  validateCheckoutPayload,
} from '@/lib/checkoutValidation'
import { AppError, getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { createOrder, rememberGuestOrderConfirmation } from '@/services/orderService'
import { toast } from 'sonner'

function RequiredMark() {
  return (
    <span className="text-danger" aria-hidden="true">
      {' '}
      *
    </span>
  )
}

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
  const [submitError, setSubmitError] = useState<string | null>(null)
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
      } catch {
        if (active) {
          setCartMessages(['تعذر التحقق من السلة حالياً. حاولي مرة أخرى.'])
          setNeedsReview(true)
        }
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
            titleAs="h1"
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

  function clearFieldError(field: keyof CheckoutFieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function acknowledgeCartReview() {
    setCheckingCart(true)
    try {
      const result = await applyCartValidation()
      if (result.ok) {
        setNeedsReview(false)
        setCartMessages([])
        setSubmitError(null)
      } else {
        setCartMessages(result.messages)
        setNeedsReview(true)
        toast.error(
          result.messages[0] ?? 'ما زالت هناك تحديثات على السلة تحتاج مراجعتك.',
        )
      }
    } catch {
      toast.error('تعذر التحقق من السلة حالياً. حاولي مرة أخرى.')
    } finally {
      setCheckingCart(false)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current || submitting || needsReview || checkingCart) return

    setSubmitError(null)

    const validated = validateCheckoutPayload({
      customerName,
      phone,
      address,
      notes,
    })

    if (!validated.ok) {
      setFieldErrors(validated.errors)
      focusFirstError(validated.errors)
      const message = 'من فضلك تأكدي من بيانات الطلب.'
      setSubmitError(message)
      toast.error(message)
      return
    }

    setFieldErrors({})
    submitLock.current = true
    setSubmitting(true)

    try {
      const cartCheck = await applyCartValidation(items)
      if (!cartCheck.ok) {
        const message =
          cartCheck.messages[0] ??
          'تم تحديث السلة. راجعي المنتجات ثم أكّدي الطلب مرة أخرى.'
        setSubmitError(message)
        toast.error(message)
        return
      }

      const confirmation = await createOrder(validated.payload, cartCheck.syncedItems)
      rememberGuestOrderConfirmation(confirmation)
      clearCart()
      toast.success('تم استلام طلبك بنجاح')
      // Keep submit locked after success so a late double-click cannot re-fire.
      navigate('/order-success', { state: { confirmation }, replace: true })
    } catch (error) {
      const message = getErrorMessage(error, 'حدث خطأ أثناء إرسال الطلب. حاولي مرة أخرى.')
      setSubmitError(message)
      toast.error(message)

      const shouldRevalidate =
        error instanceof AppError &&
        (error.code === 'validation' ||
          /متاح|المخزون|السلة|الكمية|المنتج/i.test(error.message))

      if (shouldRevalidate) {
        try {
          await applyCartValidation()
        } catch {
          // Keep the original friendly error visible.
        }
      }

      submitLock.current = false
      setSubmitting(false)
    }
  }

  const submitDisabled =
    submitting || checkingCart || needsReview || items.length === 0

  return (
    <>
      <PageMeta
        title="إتمام الطلب"
        description="أدخلي بيانات التوصيل لإتمام طلبك من أثر."
        path="/checkout"
        noIndex
      />
      <div className="container-athar py-10 sm:py-14" aria-busy={checkingCart || submitting}>
        <div className="mb-8">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">الدفع عند الاستلام</p>
          <h1 className="font-display text-3xl font-semibold">إتمام الطلب</h1>
          <p className="mt-2 text-sm text-mocha">
            أدخلي بياناتك وسنؤكد الطلب عبر الهاتف أو واتساب. لا يتم تحصيل أي دفعة إلكترونية الآن.
          </p>
          {checkingCart ? (
            <p className="mt-2 text-xs text-mocha" role="status" aria-live="polite">
              جارٍ التحقق من توفر المنتجات…
            </p>
          ) : null}
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
                disabled={checkingCart || submitting}
                onClick={() => {
                  void acknowledgeCartReview()
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">بيانات التوصيل</h2>
              <p className="text-xs text-mocha">
                الحقول المميزة بـ <span className="text-danger">*</span> مطلوبة
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerName">
                الاسم بالكامل
                <RequiredMark />
              </Label>
              <Input
                ref={nameRef}
                id="customerName"
                name="customerName"
                autoComplete="name"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  clearFieldError('customerName')
                }}
                placeholder="اسمكِ الكريم"
                maxLength={80}
                required
                aria-required="true"
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
              <Label htmlFor="phone">
                رقم الهاتف
                <RequiredMark />
              </Label>
              <Input
                ref={phoneRef}
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  clearFieldError('phone')
                }}
                placeholder="01xxxxxxxxx"
                maxLength={16}
                dir="ltr"
                className="text-start"
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-error' : 'phone-hint'}
                disabled={submitting}
              />
              {fieldErrors.phone ? (
                <p id="phone-error" className="text-xs text-danger" role="alert">
                  {fieldErrors.phone}
                </p>
              ) : (
                <p id="phone-hint" className="text-xs text-mocha">
                  رقم تواصلكِ المصري — وليس رقم متجر أثر.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">
                العنوان بالتفصيل
                <RequiredMark />
              </Label>
              <Textarea
                ref={addressRef}
                id="address"
                name="address"
                autoComplete="street-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  clearFieldError('address')
                }}
                placeholder="المحافظة، المدينة، الشارع، رقم المبنى، علامة مميزة"
                maxLength={300}
                required
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.address)}
                aria-describedby={fieldErrors.address ? 'address-error' : undefined}
                disabled={submitting}
                className="min-h-[6.5rem]"
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
                onChange={(e) => {
                  setNotes(e.target.value)
                  clearFieldError('notes')
                }}
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
                    {(() => {
                      const thumb = catalogImageProps(item.imageUrl, 'thumb')
                      return thumb ? (
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
                        <div className="flex h-full items-center justify-center font-display text-brown/25">
                          أثر
                        </div>
                      )
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-brown">{item.name}</p>
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
              <div className="flex justify-between gap-3">
                <span className="text-mocha">المجموع الفرعي</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-3 text-base font-semibold">
                <span>الإجمالي</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs leading-6 text-mocha">
                السعر النهائي يُؤكد من الخادم عند إرسال الطلب. الدفع عند الاستلام.
              </p>
            </div>

            {submitError ? (
              <p
                id="checkout-submit-error"
                className="mt-4 break-words rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs leading-6 text-danger"
                role="alert"
                aria-live="assertive"
              >
                {submitError}
              </p>
            ) : null}

            <Button
              type="submit"
              className="mt-6 w-full"
              size="lg"
              disabled={submitDisabled}
              aria-busy={submitting}
              aria-describedby={submitError ? 'checkout-submit-error' : undefined}
            >
              {submitting ? 'جاري تأكيد الطلب...' : 'تأكيد الطلب'}
            </Button>

            {submitting ? (
              <p className="mt-2 text-center text-xs text-mocha" role="status" aria-live="polite">
                يرجى الانتظار — لا تغلقي الصفحة أثناء إرسال الطلب.
              </p>
            ) : null}

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
