import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMyOrderReviews, submitVerifiedReview, type ProductReview } from '@/services/reviewService'

export function OrderProductReviews({ orderId, items }: {
  orderId: string
  items: { id: string; product_id: string | null; product_name: string }[]
}) {
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [rating, setRating] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Record<string, File | null>>({})
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    getMyOrderReviews(orderId).then(value => {
      if (mounted) setReviews(value)
    }).catch(() => { if (mounted) setError('تعذر قراءة التقييمات.') })
    return () => { mounted = false }
  }, [orderId])

  async function submit(itemId: string) {
    if (saving || !rating[itemId]) return
    setError('')
    setMessage('')
    setSaving(itemId)
    try {
      const result = await submitVerifiedReview(itemId, rating[itemId], comments[itemId] ?? '', photos[itemId])
      setReviews(await getMyOrderReviews(orderId))
      setMessage(result.imageWarning ? `تم إرسال التقييم للمراجعة. ${result.imageWarning}` : 'تم إرسال التقييم للمراجعة. لن يظهر للزوار إلا بعد موافقة الإدارة.')
    } catch {
      setError('تعذر إرسال التقييم. تأكدي من صحة الطلب وأنه تم تسليمه بالفعل.')
    } finally { setSaving('') }
  }

  return <section className="rounded-2xl border border-taupe/30 bg-card p-5">
    <h2 className="mb-2 text-lg font-semibold text-brown">قيّمي مشترياتك</h2>
    <p className="mb-4 text-sm text-mocha">النجوم من 1 إلى 5، والتعليق والصورة اختياريان. كل التقييمات تُراجع قبل النشر.</p>
    {message && <p role="status" className="mb-3 text-sm text-success">{message}</p>}
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    <div className="space-y-5">
      {items.filter(i => !!i.product_id).map(item => {
        const existing = reviews.find(r => r.order_item_id === item.id)
        return <div key={item.id} className="rounded-lg border border-taupe/30 p-4">
          <p className="mb-2 font-medium">{item.product_name}</p>
          {existing ? <p className="text-sm text-mocha">تقييمك: {existing.rating} ★ · {existing.status === 'approved' ? 'منشور' : existing.status === 'hidden' ? 'مخفي بقرار الإدارة' : 'بانتظار المراجعة'}</p> : <>
            <div className="mb-3 flex gap-2" role="group" aria-label="اختيار عدد النجوم">
              {Array.from({ length: 5 }, (_, n) => <button type="button" key={n} disabled={!!saving} onClick={() => setRating(s => ({...s,[item.id]:n+1}))}
                aria-label={`${n+1} نجوم`} aria-pressed={rating[item.id] === n+1} className="rounded p-1 text-gold-deep focus-visible:outline">
                <Star className="size-7" fill={(rating[item.id] ?? 0)>n ? 'currentColor' : 'none'} />
              </button>)}
            </div>
            <label className="mb-1 block text-sm">تعليق اختياري</label>
            <textarea maxLength={1200} rows={3} value={comments[item.id] ?? ''} onChange={e => setComments(s=>({...s,[item.id]:e.target.value}))}
              className="mb-3 w-full rounded-md border border-taupe/50 bg-transparent p-3 text-sm" placeholder="إيه رأيك في المنتج؟" />
            <label className="mb-1 block text-sm">صورة اختيارية (حتى 5 ميجابايت)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="mb-3 block w-full text-sm" onChange={e=>setPhotos(s=>({...s,[item.id]:e.target.files?.[0] ?? null}))} />
            <Button disabled={!rating[item.id] || !!saving} onClick={()=>void submit(item.id)} type="button">
              {saving===item.id ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
            </Button>
          </>}
        </div>
      })}
    </div>
  </section>
}
