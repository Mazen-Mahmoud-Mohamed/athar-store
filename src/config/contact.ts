/**
 * Public Athar contact & social links — single source of truth.
 * These are public business URLs (not secrets). Do not duplicate elsewhere.
 */
export const atharContact = {
  phoneDisplay: '01026278881',
  phoneTel: 'tel:01026278881',
  whatsappUrl: 'https://wa.me/201026278881',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61594972592611',
  instagramUrl: 'https://www.instagram.com/atha.r1797?stkn=cjRzYXFwdGRhMDNo',
  tiktokUrl: 'https://www.tiktok.com/@rana.omran57?_r=1&_t=ZS-9AEPGgd6eCD',
} as const

export type AtharSocialKey = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp'

export const atharSocialLinks: ReadonlyArray<{
  key: AtharSocialKey
  label: string
  href: string
  external: true
}> = [
  { key: 'facebook', label: 'فيسبوك', href: atharContact.facebookUrl, external: true },
  { key: 'instagram', label: 'إنستغرام', href: atharContact.instagramUrl, external: true },
  { key: 'tiktok', label: 'تيك توك', href: atharContact.tiktokUrl, external: true },
  { key: 'whatsapp', label: 'واتساب', href: atharContact.whatsappUrl, external: true },
]

/** WhatsApp deep link with a safe, non-PII prefilled message. */
export function whatsappWithMessage(message: string) {
  return `${atharContact.whatsappUrl}?text=${encodeURIComponent(message)}`
}

export function whatsappOrderFollowUpUrl(orderReference: string) {
  return whatsappWithMessage(`مرحباً أثر، أتابع طلبي برقم ${orderReference}`)
}
