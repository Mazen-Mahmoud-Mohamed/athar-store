import {
  SITE_NAME_AR,
  SITE_URL,
  absoluteUrl,
  categoryPath,
  productPath,
  truncateMeta,
} from '@/config/site'
import type { Category, Product } from '@/types'

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME_AR,
    url: `${SITE_URL}/`,
    logo: absoluteUrl('/athar-logo.png'),
    description:
      'أثر — علامة مصرية راقية للحقائب والشنط النسائية والإكسسوارات.',
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME_AR,
    url: `${SITE_URL}/`,
    inLanguage: 'ar',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function breadcrumbSchema(
  items: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function productSchema(product: Product) {
  const availability =
    product.stock_quantity > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock'

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: truncateMeta(
      product.description?.trim() || `${product.name} من أثر.`,
      300,
    ),
    brand: {
      '@type': 'Brand',
      name: SITE_NAME_AR,
    },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(productPath(product)),
      priceCurrency: 'EGP',
      price: Number(product.price).toFixed(2),
      availability,
      itemCondition: 'https://schema.org/NewCondition',
    },
  }

  if (product.image_url) {
    data.image = [product.image_url]
  }

  if (product.category?.name) {
    data.category = product.category.name
  }

  return data
}

export function itemListSchema(
  name: string,
  products: Product[],
  listPath: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: absoluteUrl(listPath),
    numberOfItems: products.length,
    itemListElement: products.slice(0, 24).map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(productPath(product)),
      name: product.name,
    })),
  }
}

export function categoryBreadcrumbs(category: Category) {
  return breadcrumbSchema([
    { name: 'الرئيسية', path: '/' },
    { name: 'المنتجات', path: '/products' },
    { name: category.name, path: categoryPath(category.slug) },
  ])
}

export function productBreadcrumbs(product: Product) {
  const items = [
    { name: 'الرئيسية', path: '/' },
    { name: 'المنتجات', path: '/products' },
  ]
  if (product.category?.slug && product.category.name) {
    items.push({
      name: product.category.name,
      path: categoryPath(product.category.slug),
    })
  }
  items.push({ name: product.name, path: productPath(product) })
  return breadcrumbSchema(items)
}
