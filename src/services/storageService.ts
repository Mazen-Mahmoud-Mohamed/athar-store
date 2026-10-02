import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'

const BUCKET = 'product-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export function validateImageFile(file: File) {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new AppError('validation', 'صيغة الصورة غير مدعومة. استخدمي JPG أو PNG أو WEBP.')
  }
  if (file.size <= 0) {
    throw new AppError('validation', 'ملف الصورة فارغ.')
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('validation', 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.')
  }
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Extract storage object path from a public URL for this bucket, if possible. */
export function extractStoragePathFromPublicUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  try {
    const url = new URL(publicUrl)
    const marker = `/object/public/${BUCKET}/`
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

export async function uploadCatalogImage(
  file: File,
  folder: 'products' | 'categories',
  entityId: string,
): Promise<{ publicUrl: string; path: string }> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  validateImageFile(file)

  try {
    const supabase = requireSupabase()
    const path = `${folder}/${entityId}/${Date.now()}.${extensionFor(file)}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { publicUrl: data.publicUrl, path }
  } catch (error) {
    throw toAppError(error, 'تعذر رفع الصورة')
  }
}

export async function removeStorageObjectByPath(path: string | null | undefined): Promise<void> {
  if (!path) return
  if (!isSupabaseConfigured) return

  try {
    const supabase = requireSupabase()
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) throw error
  } catch (error) {
    // Cleanup is best-effort after a successful DB write; surface as non-fatal AppError callers may ignore.
    throw toAppError(error, 'تعذر حذف الصورة القديمة من التخزين')
  }
}

export async function removeStorageObjectByPublicUrl(
  publicUrl: string | null | undefined,
): Promise<void> {
  const path = extractStoragePathFromPublicUrl(publicUrl)
  if (!path) return
  await removeStorageObjectByPath(path)
}
