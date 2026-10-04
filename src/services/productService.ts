import {
  normalizeSlug,
  parseMoney,
  parseStockQuantity,
  requireNonEmptyName,
  requireValidSlug,
  slugFromName,
  validateProductPricing,
} from '@/lib/catalogValidation'
import { AppError, toAppError } from '@/lib/errors'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import {
  removeStorageObjectByPublicUrl,
  uploadCatalogImage,
  validateImageFile,
} from '@/services/storageService'
import type { Product, ProductInsert, ProductUpdate } from '@/types'

const PRODUCT_SELECT = '*, category:categories(*)'

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ.')
  }
}

function mapProduct(row: Product): Product {
  return {
    ...row,
    price: Number(row.price),
    old_price: row.old_price == null ? null : Number(row.old_price),
  }
}

export type ProductInput = {
  name: string
  slug?: string
  description?: string | null
  category_id?: string | null
  price: number | string
  old_price?: number | string | null
  stock_quantity?: number | string
  is_active?: boolean
  is_featured?: boolean
  is_new?: boolean
  image_url?: string | null
}

function buildProductPayload(input: ProductInput): ProductInsert {
  const name = requireNonEmptyName(input.name, 'اسم المنتج')
  const slug = input.slug?.trim() ? requireValidSlug(input.slug) : slugFromName(name)
  const price = parseMoney(input.price, 'السعر', { required: true })
  if (price == null) throw new AppError('validation', 'السعر مطلوب.')

  const oldPrice =
    input.old_price === '' || input.old_price == null
      ? null
      : parseMoney(input.old_price, 'السعر السابق', { required: false })

  validateProductPricing(price, oldPrice)
  const stock = parseStockQuantity(input.stock_quantity)

  return {
    name,
    slug,
    description: input.description?.trim() ? input.description.trim() : null,
    category_id: input.category_id || null,
    price,
    old_price: oldPrice,
    stock_quantity: stock,
    is_active: input.is_active ?? true,
    is_featured: input.is_featured ?? false,
    is_new: input.is_new ?? false,
    ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
  }
}

export async function getActiveProducts(): Promise<Product[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتجات')
  }
}

export async function getFeaturedProducts(): Promise<Product[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتجات المميزة')
  }
}

export async function getNewProducts(): Promise<Product[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .eq('is_new', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتجات الجديدة')
  }
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل منتجات التصنيف')
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    return data ? mapProduct(data as Product) : null
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتج')
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('slug', normalizeSlug(slug).toLowerCase())
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    return data ? mapProduct(data as Product) : null
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل المنتج')
  }
}

export async function searchProducts(query: string): Promise<Product[]> {
  const trimmed = query.trim()
  if (!trimmed) return getActiveProducts()

  requireConfigured()

  try {
    const supabase = requireSupabase()
    const escaped = trimmed.replace(/[%_,]/g, '')
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر البحث في المنتجات')
  }
}

export async function adminGetAllProducts(): Promise<Product[]> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data ?? []).map((row) => mapProduct(row as Product))
  } catch (error) {
    throw toAppError(error, 'تعذر تحميل منتجات الإدارة')
  }
}

export async function adminGetProductById(id: string): Promise<Product | null> {
  requireConfigured()

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

export async function adminIsProductSlugTaken(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    let query = supabase
      .from('products')
      .select('id')
      .eq('slug', requireValidSlug(slug))
      .limit(1)

    if (excludeId) query = query.neq('id', excludeId)

    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return Boolean(data)
  } catch (error) {
    throw toAppError(error, 'تعذر التحقق من معرّف المنتج')
  }
}

export async function adminCreateProduct(input: ProductInput): Promise<Product> {
  requireConfigured()

  const payload = buildProductPayload(input)

  if (await adminIsProductSlugTaken(payload.slug)) {
    throw new AppError('validation', 'اسم الرابط مستخدم بالفعل. اختاري اسماً مختلفاً للمنتج.')
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

export async function adminUpdateProduct(id: string, input: ProductInput): Promise<Product> {
  requireConfigured()

  const payload = buildProductPayload(input)

  if (await adminIsProductSlugTaken(payload.slug, id)) {
    throw new AppError('validation', 'اسم الرابط مستخدم بالفعل. اختاري اسماً مختلفاً للمنتج.')
  }

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .update({
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        category_id: payload.category_id,
        price: payload.price,
        old_price: payload.old_price,
        stock_quantity: payload.stock_quantity,
        is_active: payload.is_active,
        is_featured: payload.is_featured,
        is_new: payload.is_new,
        ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
      } satisfies ProductUpdate)
      .eq('id', id)
      .select(PRODUCT_SELECT)
      .single()

    if (error) throw error
    return mapProduct(data as Product)
  } catch (error) {
    throw toAppError(error, 'تعذر تحديث المنتج')
  }
}

export async function adminPatchProduct(
  id: string,
  patch: ProductUpdate,
): Promise<Product> {
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .update(patch)
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
  requireConfigured()

  try {
    const supabase = requireSupabase()
    const { data: existing, error: fetchError } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error

    if (existing?.image_url) {
      try {
        await removeStorageObjectByPublicUrl(existing.image_url)
      } catch {
        // Best-effort cleanup after successful delete.
      }
    }
  } catch (error) {
    throw toAppError(error, 'تعذر حذف المنتج')
  }
}

/**
 * Upload/replace product image safely:
 * 1) upload new object
 * 2) persist public URL on the product row
 * 3) remove the previous object only after a successful DB write
 */
export async function adminReplaceProductImage(
  productId: string,
  file: File,
  currentUrl: string | null,
): Promise<Product> {
  requireConfigured()
  validateImageFile(file)

  const { publicUrl } = await uploadCatalogImage(file, 'products', productId)

  try {
    const supabase = requireSupabase()
    const { data, error } = await supabase
      .from('products')
      .update({ image_url: publicUrl })
      .eq('id', productId)
      .select(PRODUCT_SELECT)
      .single()

    if (error) throw error

    if (currentUrl && currentUrl !== publicUrl) {
      try {
        await removeStorageObjectByPublicUrl(currentUrl)
      } catch {
        // Keep the new image; old object cleanup is best-effort.
      }
    }

    return mapProduct(data as Product)
  } catch (error) {
    try {
      await removeStorageObjectByPublicUrl(publicUrl)
    } catch {
      // Avoid leaving an unreferenced upload if DB write failed.
    }
    throw toAppError(error, 'تعذر حفظ صورة المنتج')
  }
}

/** @deprecated Prefer adminReplaceProductImage for create/edit flows. */
export async function uploadProductImage(file: File, productId: string): Promise<string> {
  const { publicUrl } = await uploadCatalogImage(file, 'products', productId)
  return publicUrl
}
