import { placeholderProducts } from '@/data/placeholders'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import type { Product, ProductInsert, ProductUpdate } from '@/types'

const PRODUCT_SELECT = '*, category:categories(*)'

function mapProduct(row: Product): Product {
  return {
    ...row,
    price: Number(row.price),
    old_price: row.old_price == null ? null : Number(row.old_price),
  }
}

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

export async function getActiveProducts(): Promise<Product[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => mapProduct(row as Product))
    },
    () => placeholderProducts.filter((p) => p.is_active),
    'تعذر تحميل المنتجات',
  )
}

export async function getFeaturedProducts(): Promise<Product[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .eq('is_featured', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => mapProduct(row as Product))
    },
    () => placeholderProducts.filter((p) => p.is_active && p.is_featured),
    'تعذر تحميل المنتجات المميزة',
  )
}

export async function getNewProducts(): Promise<Product[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .eq('is_new', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => mapProduct(row as Product))
    },
    () => placeholderProducts.filter((p) => p.is_active && p.is_new),
    'تعذر تحميل المنتجات الجديدة',
  )
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => mapProduct(row as Product))
    },
    () => placeholderProducts.filter((p) => p.is_active && p.category_id === categoryId),
    'تعذر تحميل منتجات التصنيف',
  )
}

export async function getProductById(id: string): Promise<Product | null> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data ? mapProduct(data as Product) : null
    },
    () => placeholderProducts.find((p) => p.id === id) ?? null,
    'تعذر تحميل المنتج',
  )
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data ? mapProduct(data as Product) : null
    },
    () => placeholderProducts.find((p) => p.slug === slug) ?? null,
    'تعذر تحميل المنتج',
  )
}

export async function searchProducts(query: string): Promise<Product[]> {
  const trimmed = query.trim()
  if (!trimmed) return getActiveProducts()

  return withCatalogFallback(
    async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)
        .or(`name.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => mapProduct(row as Product))
    },
    () =>
      placeholderProducts.filter(
        (p) => p.is_active && (p.name.includes(trimmed) || p.description?.includes(trimmed)),
      ),
    'تعذر البحث في المنتجات',
  )
}

export async function adminGetAllProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured) return placeholderProducts

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل منتجات الإدارة')
  }
}

export async function adminGetProductById(id: string): Promise<Product | null> {
  if (!isSupabaseConfigured) {
    return placeholderProducts.find((p) => p.id === id) ?? null
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? mapProduct(data as Product) : null
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتج')
  }
}

export async function adminCreateProduct(payload: ProductInsert): Promise<Product> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select(PRODUCT_SELECT)
      .single()

    if (error) throw error
    return mapProduct(data as Product)
  } catch (error) {
    throw toAppError(error, 'تعذر إنشاء المنتج')
  }
}

export async function adminUpdateProduct(id: string, payload: ProductUpdate): Promise<Product> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select(PRODUCT_SELECT)
      .single()

    if (error) throw error
    return mapProduct(data as Product)
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث المنتج')
  }
}

export async function adminDeleteProduct(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  try {
    const supabase = requireSupabase()
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
  } catch (error) {
    throw toAppError(error, 'تعذر حذف المنتج')
  }
}

export async function uploadProductImage(file: File, productId: string): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    throw new AppError('validation', 'صيغة الصورة غير مدعومة. استخدمي JPG أو PNG أو WEBP.')
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new AppError('validation', 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.')
  }

  try {
    const supabase = requireSupabase()
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `products/${productId}/${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  } catch (error) {
    throw toAppError(error, 'تعذر رفع صورة المنتج')
  }
}
