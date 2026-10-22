import { useCallback, useEffect, useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Button } from '@/components/ui/button'
import { PageMeta } from '@/components/seo/PageMeta'
import { adminListProductReviews, adminModerateProductReview, reviewPhotoUrl, type ProductReview } from '@/services/reviewService'

export function AdminReviewsPage() {
  const [status, setStatus] = useState('pending')
  const [reviews, setReviews] = useState<(ProductReview & { photoUrl?: string | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await adminListProductReviews(status)
      setReviews(await Promise.all(list.map(async review => ({
        ...review, photoUrl: review.photo_path ? await reviewPhotoUrl(review.photo_path) : null,
      }))))
    } catch { setError('تعذر تحميل التقييمات. تأكدي من صلاحيات الإدارة.') }
    finally { setLoading(false) }
  }, [status])
  useEffect(() => { void load() }, [load])

  async function moderate(review: ProductReview, action: 'approve' | 'hide' | 'delete') {
    if (busy) return
    if (action === 'delete' && !window.confirm('حذف التقييم نهائيًا؟ لا يمكن استعادته.')) return
    setBusy(review.id)
    setError('')
    try {
      await adminModerateProductReview(review.id, action)
      await load()
    } catch { setError('تعذر تحديث حالة التقييم. حاولي مرة أخرى.') }
    finally { setBusy('') }
  }
  return <div className="space-y-5">
    <PageMeta title="مراجعة تقييمات العملاء" path="/admin/reviews" noIndex />
    <AdminPageHeader title="تقييمات العملاء" description="راجعي النجوم والتعليقات والصور قبل عرضها على الموقع." />
    <div className="flex flex-wrap gap-2">
      {[['pending','بانتظار المراجعة'],['approved','المنشورة'],['hidden','المخفية'],['all','الكل']].map(([value,label])=>
        <Button key={value} variant={status===value?'default':'outline'} size="sm" onClick={()=>setStatus(value)}>{label}</Button>)}
    </div>
    {error && <p role="alert" className="rounded-lg bg-danger/5 p-3 text-danger">{error}</p>}
    {loading ? <p>جارٍ تحميل التقييمات...</p> : !reviews.length ? <p className="text-mocha">لا توجد تقييمات في هذا القسم.</p> : (
      <div className="space-y-4">
        {reviews.map(review=><article key={review.id} className="rounded-xl border border-taupe/40 bg-card p-5">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{review.rating} ★</strong>
            <span className="text-xs text-mocha">{review.status === 'pending' ? 'بانتظار المراجعة' : review.status === 'approved' ? 'منشور' : 'مخفي'}</span>
          </div>
          <p className="mt-2 text-xs text-mocha">المنتج: {review.product_id} · تاريخ: {new Date(review.created_at).toLocaleDateString('ar-EG')}</p>
          {review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{review.comment}</p>}
          {review.photoUrl && <a href={review.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block w-fit">
            <img src={review.photoUrl} alt="صورة التقييم للمراجعة" className="max-h-64 rounded-lg object-contain" /></a>}
          <div className="mt-4 flex flex-wrap gap-2">
            {review.status !== 'approved' && <Button size="sm" disabled={!!busy} onClick={()=>void moderate(review,'approve')}>موافقة ونشر</Button>}
            {review.status !== 'hidden' && <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void moderate(review,'hide')}>إخفاء</Button>}
            <Button size="sm" variant="outline" className="border-danger/40 text-danger" disabled={!!busy} onClick={()=>void moderate(review,'delete')}>حذف نهائي</Button>
          </div>
        </article>)}
      </div>
    )}
  </div>
}
