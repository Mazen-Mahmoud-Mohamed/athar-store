/** Production site origin for SEO/canonical links. */
export const SITE_URL = 'https://athar.qd.je'
export const SITE_NAME = 'أثر | Athar'
export const SITE_NAME_AR = 'أثر'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/athar-logo.png`

export const DEFAULT_DESCRIPTION =
  'أثر — علامة مصرية راقية للحقائب والشنط النسائية والإكسسوارات. أناقة تترك أثرًا.'

export const HOME_TITLE = 'أثر | حقائب وشنط نسائية أنيقة'
export const HOME_DESCRIPTION =
  'اكتشفي حقائب وشنط وإكسسوارات أثر — قطع مصرية أنثوية راقية بتفاصيل دافئة وحضور هادئ.'

export const PRODUCTS_TITLE = 'منتجات أثر | حقائب وإكسسوارات'
export const PRODUCTS_DESCRIPTION =
  'تسوّقي جميع منتجات أثر للحقائب والشنط والإكسسوارات — مجموعة راقية مختارة بعناية.'

export function absoluteUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return new URL(normalized, `${SITE_URL}/`).toString()
}

export function productPath(product: { slug?: string | null; id: string }): string {
  const slug = product.slug?.trim()
  return slug ? `/products/${slug}` : `/products/${product.id}`
}

export function categoryPath(slug: string): string {
  return `/category/${slug}`
}

export function truncateMeta(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1).trimEnd()}…`
}
