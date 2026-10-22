// Only known local destinations are accepted; never redirect to arbitrary URLs.
export function customerReturnPath(value: string | null): string {
  if (value === '/checkout' || value === '/checkout?intent=buy-now') return value
  if (value === '/account' || value === '/account/orders' || /^\/account\/orders\/[a-f0-9-]{36}$/.test(value ?? '')) return value!
  return '/account'
}

export function authReturnUrl(path: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}auth/callback?next=${encodeURIComponent(customerReturnPath(path))}`
}
