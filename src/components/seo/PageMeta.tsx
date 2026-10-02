import { useEffect } from 'react'

type PageMetaProps = {
  title?: string
  description?: string
}

const DEFAULT_TITLE = 'أثر | Athar'
const DEFAULT_DESCRIPTION =
  'أثر — علامة مصرية راقية للحقائب والإكسسوارات. أناقة تترك أثراً.'

export function PageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
}: PageMetaProps) {
  useEffect(() => {
    document.title = title ? `${title} | أثر` : DEFAULT_TITLE

    const metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription) {
      metaDescription.setAttribute('content', description)
    }

    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) {
      ogTitle.setAttribute('content', title ? `${title} | أثر` : DEFAULT_TITLE)
    }

    const ogDescription = document.querySelector('meta[property="og:description"]')
    if (ogDescription) {
      ogDescription.setAttribute('content', description)
    }
  }, [title, description])

  return null
}
