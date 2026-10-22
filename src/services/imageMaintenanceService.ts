import { requireSupabase } from '@/lib/supabase'
import { optimizeImageForUpload } from '@/lib/imageOptimization'
import { extractStoragePathFromPublicUrl } from '@/services/storageService'
import { adminGetAllProducts, adminReplaceProductImage } from '@/services/productService'
import { adminGetAllCategories, adminReplaceCategoryImage } from '@/services/categoryService'

export type ImageMaintenanceReport = {
  scanned: number
  replaced: number
  skipped: number
  failed: number
  originalBytes: number
  savedBytes: number
}

/**
 * Explicit admin-only batch: preserve the existing image unless our local
 * encoder gives a meaningful reduction. Each database update is done using
 * the existing upload -> update -> best-effort old-object cleanup workflow.
 */
export async function optimizeExistingCatalogImages(
  onProgress?: (progress: { done: number; total: number }) => void,
): Promise<ImageMaintenanceReport> {
  const supabase = requireSupabase()
  const { data: admin, error: adminError } = await supabase.rpc('is_admin')
  if (adminError || !admin) throw new Error('تحتاج صلاحية الأدمن لتحسين الصور.')

  const [products, categories] = await Promise.all([adminGetAllProducts(), adminGetAllCategories()])
  const tasks = [
    ...products.filter(row => !!row.image_url).map(row => ({
      kind: 'product' as const, id: row.id, url: row.image_url!,
    })),
    ...categories.filter(row => !!row.image_url).map(row => ({
      kind: 'category' as const, id: row.id, url: row.image_url!,
    })),
  ]
  const report: ImageMaintenanceReport = { scanned: 0, replaced: 0, skipped: 0, failed: 0, originalBytes: 0, savedBytes: 0 }

  for (const item of tasks) {
    try {
      const path = extractStoragePathFromPublicUrl(item.url)
      // External images are not owned by the store and must never be replaced.
      if (!path) { report.skipped++; continue }
      const { data: blob, error } = await supabase.storage.from('product-images').download(path)
      if (error || !blob) { report.failed++; continue }
      const type = blob.type.startsWith('image/') ? blob.type : path.toLowerCase().endsWith('.png') ? 'image/png' : path.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
      const original = new File([blob], path.split('/').pop() ?? 'image.jpg', { type })
      const optimized = await optimizeImageForUpload(original, 'catalog')
      if (optimized.size >= original.size * 0.92 || optimized.type === original.type && optimized.size === original.size) {
        report.skipped++
        continue
      }
      if (item.kind === 'product') await adminReplaceProductImage(item.id, optimized, item.url)
      else await adminReplaceCategoryImage(item.id, optimized, item.url)
      report.replaced++
      report.originalBytes += original.size
      report.savedBytes += original.size - optimized.size
    } catch {
      report.failed++
    } finally {
      report.scanned++
      onProgress?.({ done: report.scanned, total: tasks.length })
    }
  }
  return report
}
