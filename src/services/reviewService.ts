import { requireSupabase } from '@/lib/supabase'

export type ProductReview = {
  id: string
  order_item_id: string
  product_id: string
  customer_id: string
  rating: number
  comment: string | null
  photo_path: string | null
  status: 'pending' | 'approved' | 'hidden'
  created_at: string
}
export type VisibleProductReview = {
  review_id: string
  rating: number
  comment: string | null
  photo_path: string | null
  created_at: string
}
const BUCKET = 'product-review-photos'

export async function getMyOrderReviews(orderId: string): Promise<ProductReview[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('product_reviews').select('*').eq('order_id', orderId)
  if (error) throw error
  return (data ?? []) as ProductReview[]
}

export async function submitVerifiedReview(
  orderItemId: string,
  rating: number,
  comment: string,
  photo?: File | null,
): Promise<{ imageWarning?: string }> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('submit_product_review', {
    p_order_item_id: orderItemId,
    p_rating: rating,
    p_comment: comment.trim() || null,
  })
  if (error) throw error
  const review = data as ProductReview
  if (!photo) return {}
  const validTypes: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  }
  const extension = validTypes[photo.type]
  if (!extension || photo.size > 5 * 1024 * 1024) {
    return { imageWarning: 'اتسجل التقييم، لكن الصورة لازم تكون JPG أو PNG أو WebP وبحجم أقل من 5 ميجابايت.' }
  }
  const path = review.id + '/photo.' + extension
  const upload = await client.storage.from(BUCKET).upload(path, photo, {
    upsert: false, contentType: photo.type,
  })
  if (upload.error) return { imageWarning: 'اتسجل التقييم، لكن رفع الصورة فشل.' }
  const attach = await client.rpc('attach_product_review_photo', {
    p_review_id: review.id, p_path: path,
  })
  if (attach.error) return { imageWarning: 'اتسجل التقييم، لكن ربط الصورة فشل.' }
  return {}
}

export async function getPublicReviews(productId: string): Promise<{
  reviews: (VisibleProductReview & { photoUrl: string | null })[]
  average: number
  count: number
}> {
  const client = requireSupabase()
  const [reviewsResponse, summaryResponse] = await Promise.all([
    client.rpc('get_product_reviews', { p_product_id: productId }),
    client.rpc('get_product_rating_summary', { p_product_id: productId }),
  ])
  if (reviewsResponse.error) throw reviewsResponse.error
  if (summaryResponse.error) throw summaryResponse.error
  const reviews = (reviewsResponse.data ?? []) as VisibleProductReview[]
  const signed = await Promise.all(reviews.map(async (review) => {
    if (!review.photo_path) return { ...review, photoUrl: null }
    const { data } = await client.storage.from(BUCKET).createSignedUrl(review.photo_path, 3600)
    return { ...review, photoUrl: data?.signedUrl ?? null }
  }))
  const summary = (summaryResponse.data as { average_rating: number; review_count: number }[] | null)?.[0]
  return { reviews: signed, average: Number(summary?.average_rating ?? 0), count: Number(summary?.review_count ?? 0) }
}

export async function adminListProductReviews(status: 'pending' | 'approved' | 'hidden' | 'all' = 'pending') {
  const client = requireSupabase()
  let query = client.from('product_reviews').select('*').order('created_at', { ascending: false }).limit(100)
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ProductReview[]
}

export async function adminModerateProductReview(
  id: string, action: 'approve' | 'hide' | 'delete',
) {
  const { error } = await requireSupabase().rpc('admin_moderate_product_review', {
    p_review_id: id, p_action: action,
  })
  if (error) throw error
}

export async function reviewPhotoUrl(path: string): Promise<string | null> {
  const { data } = await requireSupabase().storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
