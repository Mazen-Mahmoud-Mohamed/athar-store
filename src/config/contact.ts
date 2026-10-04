/**
 * Public Athar contact & social links — single source of truth.
 * These are public business URLs (not secrets). Do not duplicate elsewhere.
 */
export const atharContact = {
  phoneDisplay: '01026278881',
  phoneTel: 'tel:01026278881',
  emailDisplay: 'Atharbags2026@gmail.com',
  emailMailto: 'mailto:Atharbags2026@gmail.com',
  whatsappUrl: 'https://wa.me/201026278881',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61594972592611',
  instagramUrl: 'https://www.instagram.com/atha.r1797?stkn=cjRzYXFwdGRhMDNo',
  tiktokUrl: 'https://www.tiktok.com/@rana.omran57?_r=1&_t=ZS-9AEPGgd6eCD',
  /** Visible storefront address — must not include street number "14". */
  addressDisplay:
    'Al-Omda Street, off Mohamed Abdel Zaher, in front of the Walaa neighborhood',
  mapsUrl: 'https://maps.app.goo.gl/18U3fzohWhETXiVG9',
  mapsEmbedSrc:
    'https://www.google.com/maps/embed?pb=!1m16!1m12!1m3!1d215.9221177286727!2d31.194635479787596!3d30.0152225963752!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!2m1!1s14%20Al-Omda%20Street%2C%20off%20Mohamed%20Abdel%20Zaher%2C%20in%20front%20of%20the%20Walaa%20neighborhood!5e0!3m2!1sar!2seg!4v1791118997625!5m2!1sar!2seg',
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
