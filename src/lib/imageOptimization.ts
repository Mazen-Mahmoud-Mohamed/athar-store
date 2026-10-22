/**
 * Client-side upload optimizer. Works independently of Supabase's paid image
 * transformation feature. Always keep the original unless the result is smaller.
 *
 * Encoding is visually high-quality (not mathematically lossless).
 */
export type ImageOptimizationKind = 'catalog' | 'review'

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const DIMENSIONS: Record<ImageOptimizationKind, number> = {
  catalog: 2048,
  review: 1600,
}
const SOURCE_MAX_BYTES = 35 * 1024 * 1024
const MAX_PIXELS = 50_000_000

export async function optimizeImageForUpload(
  source: File,
  kind: ImageOptimizationKind,
): Promise<File> {
  if (!ALLOWED_TYPES.has(source.type)) {
    throw new Error('صيغة الصورة غير مدعومة. اختاري JPG أو PNG أو WebP.')
  }
  if (!source.size || source.size > SOURCE_MAX_BYTES) {
    throw new Error('الصورة فارغة أو حجمها أكبر من 35 ميجابايت.')
  }
  // No browser canvas available (e.g. SSR or older engines): validate the
  // original rather than breaking uploads.
  if (typeof createImageBitmap !== 'function') {
    if (source.size > IMAGE_UPLOAD_MAX_BYTES) throw new Error('الصورة كبيرة جدًا للرفع.')
    return source
  }

  let bitmap: ImageBitmap | undefined
  let canvas: HTMLCanvasElement | undefined
  try {
    bitmap = await createImageBitmap(source)
    const { width, height } = bitmap
    if (!width || !height || width * height > MAX_PIXELS) {
      throw new Error('أبعاد الصورة كبيرة جدًا.')
    }

    const edge = DIMENSIONS[kind]
    const scale = Math.min(1, edge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('تعذر تجهيز الصورة.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    const webp = await new Promise<Blob | null>(resolve => {
      canvas!.toBlob(resolve, 'image/webp', 0.88)
    })
    if (webp?.type !== 'image/webp') {
      if (source.size > IMAGE_UPLOAD_MAX_BYTES) throw new Error('صيغة الصورة غير مدعومة في المتصفح.')
      return source
    }

    // Skip unnecessary recompression of already-efficient images. Do not
    // degrade quality just to save a tiny number of bytes.
    if (webp.size < source.size * 0.92 && webp.size <= IMAGE_UPLOAD_MAX_BYTES) {
      const base = source.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'image'
      return new File([webp], base + '.webp', {
        type: 'image/webp',
        lastModified: source.lastModified,
      })
    }
    if (source.size <= IMAGE_UPLOAD_MAX_BYTES) return source
    if (webp.size <= IMAGE_UPLOAD_MAX_BYTES) {
      const base = source.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'image'
      return new File([webp], base + '.webp', {
        type: 'image/webp',
        lastModified: source.lastModified,
      })
    }
    throw new Error('الصورة ما زالت أكبر من 5 ميجابايت بعد الضغط.')
  } catch (error) {
    // An actual decode/encode error must not silently upload an oversized file.
    if (source.size <= IMAGE_UPLOAD_MAX_BYTES && error instanceof DOMException) {
      return source
    }
    throw error
  } finally {
    bitmap?.close()
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}
