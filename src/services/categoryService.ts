import {
  normalizeSlug,
  requireNonEmptyName,
  requireValidSlug,
  slugFromName,
} from '@/lib/catalogValidation'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import {
  removeStorageObjectByPublicUrl,
  uploadCatalogImage,
  validateImageFile,
} from '@/services/storageService'
import type { Category, CategoryInsert, CategoryUpdate } from '@/types'

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }
}

export type CategoryInput = {
  name: string
  slug?: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
  image_url?: string | null
}

function buildCategoryPayload(input: CategoryInput): CategoryInsert {
  const name = requireNonEmptyName(input.name, 'اسم التصنيف')
  const slug = input.slug?.trim() ? requireValidSlug(input.slug) : slugFromName(name)
  const sortOrder = Number(input.sort_order ?? 0)

  if (!Number.isInteger(sortOrder)) {
    throw new AppError('validation', 'ترتيب العرض يجب أن يكون عدداً صحيحاً.')
  }

  return {
    name,
    slug,
    description: input.description?.trim() ? input.description.trim() : null,
    sort_order: sortOrder,
    is_active: input.is_active ?? true,
    image_url: input.image_url ?? null,
  }
}

export async function getActiveCategories(): Promise<Category[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return data ?? []
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل التصنيفات')
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', normalizeSlug(slug).toLowerCase())
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل التصنيف')
  }
}

export async function adminGetAllCategories(): Promise<Category[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error
    return data ?? []
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل تصنيفات الإدارة')
  }
}

export async function adminIsCategorySlugTaken(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    let query = supabase
      .from('categories')
      .select('id')
      .eq('slug', requireValidSlug(slug))
      .limit(1)

    if (excludeId) query = query.neq('id', excludeId)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return Boolean(data)
  } catch (error) {
    throw toAppError(error, 'تعذر التحقق من معرّف التصنيف')
  }
}

export async function adminCountProductsInCategory(categoryId: string): Promise<number> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)

    if (error) throw error
    return count ?? 0
  } catch (error) {
    throw toAppError(error, 'تعذر التحقق من منتجات التصنيف')
  }
}

export async function adminCreateCategory(input: CategoryInput): Promise<Category> {
  requireConfigured()

  const payload = buildCategoryPayload(input)

  if (await adminIsCategorySlugTaken(payload.slug)) {
    throw new AppError('validation', 'هذا المعرّف (Slug) مستخدم بالفعل. اختاري معرّفاً آخر.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase.from('categories').insert(payload).select('*').single()
    if (error) throw error
    return data
  } catch (error) {
    throw toAppError(error, 'تعذر إنشاء التصنيف')
  }
}

export async function adminUpdateCategory(
  id: string,
  input: CategoryInput & CategoryUpdate,
): Promise<Category> {
  requireConfigured()

  const payload = buildCategoryPayload(input)

  if (await adminIsCategorySlugTaken(payload.slug, id)) {
    throw new AppError('validation', 'هذا المعرّف (Slug) مستخدم بالفعل. اختاري معرّفاً آخر.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .update({
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        sort_order: payload.sort_order,
        is_active: payload.is_active,
        ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث التصنيف')
  }
}

export async function adminToggleCategoryActive(id: string, isActive: boolean): Promise<Category> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .update({ is_active: isActive })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث حالة التصنيف')
  }
}

export async function adminDeleteCategory(id: string): Promise<void> {
  requireConfigured()

  const productCount = await adminCountProductsInCategory(id)
  if (productCount > 0) {
    throw new AppError(
      'validation',
      `لا يمكن حذف هذا التصنيف لأن ${productCount} منتج مرتبط به. انقلي المنتجات أو أزيلي ارتباطها أولاً.`,
    )
  }

  try {
    const supabase = requireSupabase()
    const { data: existing, error: fetchError } = await supabase
      .from('categories')
      .select('image_url')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError

    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error

    if (existing?.image_url) {
      try {
        await removeStorageObjectByPublicUrl(existing.image_url)
      } catch {
        // Best-effort cleanup after successful delete.
      }
    }
  } catch (error) {
    throw toAppError(error, 'تعذر حذف التصنيف')
  }
}

/**
 * Upload/replace category image: upload first, persist URL, then remove the previous object.
 */
export async function adminReplaceCategoryImage(
  categoryId: string,
  file: File,
  currentUrl: string | null,
): Promise<Category> {
  requireConfigured()
  validateImageFile(file)

  const { publicUrl } = await uploadCatalogImage(file, 'categories', categoryId)

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .update({ image_url: publicUrl })
      .eq('id', categoryId)
      .select('*')
      .single()

    if (error) throw error

    if (currentUrl && currentUrl !== publicUrl) {
      try {
        await removeStorageObjectByPublicUrl(currentUrl)
      } catch {
        // Keep the new image; old object cleanup is best-effort.
      }
    }

    return data
  } catch (error) {
    try {
      await removeStorageObjectByPublicUrl(publicUrl)
    } catch {
      // Avoid leaving an unreferenced upload if DB write failed.
    }
    throw toAppError(error, 'تعذر حفظ صورة التصنيف')
  }
}
