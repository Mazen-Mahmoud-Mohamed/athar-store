import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useCart } from '@/features/cart/cart-context'
import { getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { createOrder } from '@/services/orderService'
import { toast } from 'sonner'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { items, subtotal, total, clearCart } = useCart()
  const [submitting, setSubmitting] = useState(false)

  if (items.length === 0) {
    return (
      <>
        <PageMeta title="إتمام الطلب" />
        <div className="container-athar py-16 text-center">
          <p className="font-display text-xl">لا توجد منتجات لإتمام الطلب</p>
          <Button asChild className="mt-6">
            <Link to="/products">العودة للمنتجات</Link>
          </Button>
        </div>
      </>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setSubmitting(true)
    try {
      await createOrder(
        {
          customerName: String(form.get('customerName') ?? ''),
          phone: String(form.get('phone') ?? ''),
          address: String(form.get('address') ?? ''),
          notes: String(form.get('notes') ?? '') || undefined,
        },
        items,
      )
      clearCart()
      toast.success('تم استلام طلبك بنجاح')
      navigate('/order-success')
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر إتمام الطلب'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="إتمام الطلب" description="أدخلي بيانات التوصيل لإتمام طلبك من أثر." />
      <div className="container-athar py-10 sm:py-14">
        <div className="mb-8">
          <p className="mb-2 text-xs tracking-[0.25em] text-gold-deep">الدفع عند الاستلام</p>
          <h1 className="font-display text-3xl font-semibold">إتمام الطلب</h1>
        </div>

        <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5 rounded-xl border border-taupe/30 bg-card p-6">
            <div className="space-y-2">
              <Label htmlFor="customerName">الاسم بالكامل</Label>
              <Input id="customerName" name="customerName" required placeholder="اسمكِ الكريم" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="01xxxxxxxxx"
                dir="ltr"
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                name="address"
                required
                placeholder="المحافظة، المدينة، الشارع، رقم المبنى"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Input id="notes" name="notes" placeholder="أي تفاصيل إضافية للتوصيل" />
            </div>
          </div>

          <aside className="h-fit rounded-xl border border-taupe/30 bg-card p-6">
            <h2 className="font-display text-lg font-semibold">طلبك</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {items.map((item) => (
                <li key={item.productId} className="flex justify-between gap-3">
                  <span className="text-mocha">
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-mocha">المجموع الفرعي</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>الإجمالي</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Button type="submit" className="mt-6 w-full" size="lg" disabled={submitting}>
              {submitting ? 'جاري التأكيد...' : 'تأكيد الطلب'}
            </Button>
          </aside>
        </form>
      </div>
    </>
  )
}
