import { placeholderCategories } from '@/data/placeholders'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import type { Category, CategoryInsert, CategoryUpdate } from '@/types'

function isSchemaUnavailable(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? '')
  const code = String((error as { code?: string })?.code ?? '')
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table|relation .* does not exist|schema cache/i.test(message)
  )
}

async function withCatalogFallback<T>(
  live: () => Promise<T>,
  fallback: () => T,
  errorMessage: string,
): Promise<T> {
  if (!isSupabaseConfigured) return fallback()
  try {
    return await live()
  } catch (error) {
    if (isSchemaUnavailable(error)) return fallback()
    throw toAppError(error, errorMessage)
  }
}

export async function getActiveCategories(): Promise<Category[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    () => placeholderCategories.filter((c) => c.is_active),
    'تعذر تحميل التصنيفات',
  )
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data
    },
    () => placeholderCategories.find((c) => c.slug === slug) ?? null,
    'تعذر تحميل التصنيف',
  )
}

export async function adminGetAllCategories(): Promise<Category[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    () => placeholderCategories,
    'تعذر تحميل تصنيفات الإدارة',
  )
}

export async function adminCreateCategory(payload: CategoryInsert): Promise<Category> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
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

export async function adminUpdateCategory(id: string, payload: CategoryUpdate): Promise<Category> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث التصنيف')
  }
}

export async function adminDeleteCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
  } catch (error) {
    throw toAppError(error, 'تعذر حذف التصنيف')
  }
}
