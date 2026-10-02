import { Phone } from 'lucide-react'
import { SocialIcon } from '@/components/SocialIcon'
import { atharContact, atharSocialLinks } from '@/config/contact'
import { cn } from '@/lib/utils'

const externalRel = 'noopener noreferrer'

type ContactLinksProps = {
  className?: string
  iconClassName?: string
  showPhone?: boolean
  compact?: boolean
}

export function ContactLinks({
  className,
  iconClassName,
  showPhone = true,
  compact = false,
}: ContactLinksProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {atharSocialLinks.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target="_blank"
          rel={externalRel}
          aria-label={link.label}
          title={link.label}
          className={cn(
            'inline-flex items-center justify-center rounded-md border border-current/15 transition-colors',
            compact ? 'size-9' : 'size-10',
            iconClassName,
          )}
        >
          <SocialIcon name={link.key} />
        </a>
      ))}
      {showPhone ? (
        <a
          href={atharContact.phoneTel}
          aria-label={`اتصل على ${atharContact.phoneDisplay}`}
          title={atharContact.phoneDisplay}
          className={cn(
            'inline-flex items-center justify-center rounded-md border border-current/15 transition-colors',
            compact ? 'size-9' : 'size-10',
            iconClassName,
          )}
        >
          <Phone className="size-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}

export function WhatsAppCta({
  className,
  label = 'تواصل معنا عبر واتساب',
}: {
  className?: string
  label?: string
}) {
  return (
    <a
      href={atharContact.whatsappUrl}
      target="_blank"
      rel={externalRel}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-espresso transition hover:bg-gold-soft',
        className,
      )}
    >
      <SocialIcon name="whatsapp" />
      <span>{label}</span>
    </a>
  )
}
