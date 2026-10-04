import { useEffect } from 'react'

type JsonLdProps = {
  id: string
  data: Record<string, unknown> | Array<Record<string, unknown>>
}

/** Injects/updates a JSON-LD script tag in document.head. */
export function JsonLd({ id, data }: JsonLdProps) {
  const serialized = JSON.stringify(data)

  useEffect(() => {
    const scriptId = `jsonld-${id}`
    let el = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = scriptId
      document.head.appendChild(el)
    }
    el.textContent = serialized

    return () => {
      el?.remove()
    }
  }, [id, serialized])

  return null
}
