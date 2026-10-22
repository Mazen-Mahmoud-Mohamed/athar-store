import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { getPublicReviews, type VisibleProductReview } from '@/services/reviewService'

type ShownReview = VisibleProductReview & { photoUrl: string | null }

export function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<ShownReview[]>([])
  const [average, setAverage] = useState(0)
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setError('')
    getPublicReviews(productId).then((result) => {
      if (!active) return
      setReviews(result.reviews)
      setAverage(result.average)
      setCount(result.count)
    }).catch(() => { if (active) setError('تعذر تحميل التقييمات حاليًا.') })
    return () => { active = false }
  }, [productId])

  return <section className="mt-12 border-t border-taupe/30 pt-8" aria-label="تقييمات العملاء">
    <h2 className="font-display text-2xl font-semibold text-brown">تقييمات العملاء</h2>
    <p className="mt-2 text-sm text-mocha">
      {count ? `${average.toFixed(1)} من 5 ★ — ${count} تقييم من مشتريات مؤكدة` : 'لم تُنشر تقييمات لهذا المنتج بعد.'}
    </p>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      {reviews.map(review => <article key={review.review_id} className="rounded-xl border border-taupe/30 bg-card p-4">
        <div className="flex gap-1 text-gold-deep" aria-label={`${review.rating} من 5 نجوم`}>
          {Array.from({ length: 5 }, (_,i) => <Star key={i} className="size-4" fill={i < review.rating ? 'currentColor' : 'none'} />)}
        </div>
        <p className="mt-3 text-sm font-semibold text-brown">{review.display_name || 'عميل من أثر'}</p>
        {review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-brown">{review.comment}</p>}
        {review.photoUrl && <a href={review.photoUrl} target="_blank" rel="noopener noreferrer" aria-label="عرض صورة التقييم">
          <img src={review.photoUrl} alt="صورة من تقييم عميل" loading="lazy" className="mt-3 max-h-60 rounded-lg object-contain" />
        </a>}
        <p className="mt-3 text-xs text-mocha">شراء مؤكد · {new Date(review.created_at).toLocaleDateString('ar-EG')}</p>
      </article>)}
    </div>
  </section>
}
