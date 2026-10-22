/** Safe local post-auth navigation. Reject external URLs and recursive auth redirects. */
export function customerReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (/[\\\x00-\x1f\x7f]/.test(value)) return '/'
  try {
    const url = new URL(value, 'https://athar.qd.je')
    if (url.origin !== 'https://athar.qd.je') return '/'
    const path = url.pathname
    // Redirect only to known storefront routes. Never to admin/auth/payment result endpoints.
    const allowed =
      path === '/' || path === '/products' || path === '/cart' ||
      path === '/checkout' || path === '/account' || path === '/account/profile' ||
      path === '/return-policy' || path === '/terms' || path === '/privacy-policy' ||
      /^\/products\/[a-zA-Z0-9\u0600-\u06FF-]+$/.test(path) ||
      /^\/category\/[a-zA-Z0-9\u0600-\u06FF-]+$/.test(path) ||
      /^\/account\/orders\/[a-f0-9-]{36}$/.test(path)
    if (!allowed) return '/'
    if (path === '/checkout') {
      return url.searchParams.get('intent') === 'buy-now' ? '/checkout?intent=buy-now' : '/checkout'
    }
    if (path === '/products') {
      // Preserve search and catalog selections without admitting arbitrary callback parameters.
      const safe = new URLSearchParams()
      for (const key of ['q','category','sort','new','featured','sale','min','max']) {
        const v = url.searchParams.get(key)
        if (v) safe.set(key, v.slice(0,200))
      }
      return path + (safe.size ? '?' + safe.toString() : '') + url.hash
    }
    return path + url.hash
  } catch { return '/' }
}

export function authReturnUrl(path: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}auth/callback?next=${encodeURIComponent(customerReturnPath(path))}`
}
