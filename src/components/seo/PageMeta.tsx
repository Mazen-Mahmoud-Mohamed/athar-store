import { useEffect } from 'react'
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from '@/config/site'

type PageMetaProps = {
  title?: string
  description?: string
  path?: string
  image?: string | null
  noIndex?: boolean
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

export function PageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image,
  noIndex = false,
}: PageMetaProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} | أثر` : SITE_NAME
    const canonical = new URL(path.startsWith('/') ? path : `/${path}`, SITE_URL).toString()
    const ogImage = image?.startsWith('http')
      ? image
      : new URL(image || '/athar-logo.png', SITE_URL).toString()

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonical)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:locale', 'ar_EG')
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow')
    upsertLink('canonical', canonical)
  }, [title, description, path, image, noIndex])

  return null
}
