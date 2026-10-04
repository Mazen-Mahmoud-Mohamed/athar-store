import { useEffect } from 'react'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_NAME_AR,
  absoluteUrl,
} from '@/config/site'

type PageMetaProps = {
  /** Page title segment. With absoluteTitle=false becomes "{title} | أثر". */
  title?: string
  description?: string
  /** Canonical path only (no query string). Defaults to "/". */
  path?: string
  image?: string | null
  noIndex?: boolean
  /** When true, `title` is used as the full document title. */
  absoluteTitle?: boolean
  ogType?: 'website' | 'product'
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function cleanPath(path: string) {
  const withSlash = path.startsWith('/') ? path : `/${path}`
  // Canonicals never include query/hash — filters/search must not create duplicates.
  return withSlash.split('?')[0]?.split('#')[0] || '/'
}

export function PageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image,
  noIndex = false,
  absoluteTitle = false,
  ogType = 'website',
}: PageMetaProps) {
  useEffect(() => {
    const fullTitle = absoluteTitle
      ? title || SITE_NAME
      : title
        ? `${title} | أثر`
        : SITE_NAME
    const canonicalPath = cleanPath(path)
    const canonical = absoluteUrl(canonicalPath)
    const ogImage = image?.startsWith('http')
      ? image
      : image
        ? absoluteUrl(image)
        : DEFAULT_OG_IMAGE

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:site_name', SITE_NAME_AR)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonical)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('property', 'og:type', ogType)
    upsertMeta('property', 'og:locale', 'ar_EG')
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', ogImage)
    upsertMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow')
    upsertLink('canonical', canonical)
  }, [title, description, path, image, noIndex, absoluteTitle, ogType])

  return null
}
