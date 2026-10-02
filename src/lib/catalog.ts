import type { Product } from '@/types'

export type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'name'

export type CatalogFilters = {
  categorySlug?: string
  onlyNew?: boolean
  onlyFeatured?: boolean
  onlySale?: boolean
  minPrice?: number | null
  maxPrice?: number | null
  sort?: CatalogSort
}

export function isOnSale(product: Product) {
  return product.old_price != null && product.old_price > product.price
}

export function filterAndSortProducts(products: Product[], filters: CatalogFilters = {}) {
  const {
    categorySlug,
    onlyNew,
    onlyFeatured,
    onlySale,
    minPrice,
    maxPrice,
    sort = 'newest',
  } = filters

  let rows = products.filter((product) => {
    if (categorySlug && product.category?.slug !== categorySlug) return false
    if (onlyNew && !product.is_new) return false
    if (onlyFeatured && !product.is_featured) return false
    if (onlySale && !isOnSale(product)) return false
    if (minPrice != null && Number.isFinite(minPrice) && product.price < minPrice) return false
    if (maxPrice != null && Number.isFinite(maxPrice) && product.price > maxPrice) return false
    return true
  })

  rows = [...rows].sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return a.price - b.price
      case 'price_desc':
        return b.price - a.price
      case 'name':
        return a.name.localeCompare(b.name, 'ar')
      case 'newest':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
  })

  return rows
}
