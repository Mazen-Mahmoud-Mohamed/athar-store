import type { SVGProps } from 'react'
import { MessageCircle } from 'lucide-react'
import type { AtharSocialKey } from '@/config/contact'
import { cn } from '@/lib/utils'

type IconProps = SVGProps<SVGSVGElement> & { className?: string }

function FacebookIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4', className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H8v3h3v7h3v-7h2.5l.5-3H14V9z" />
    </svg>
  )
}

function InstagramIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-4', className)}
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Official TikTok-style note mark (filled), matched to ~16px social icon weight. */
function TikTokIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('size-4', className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.2 8.2 0 0 0 4.76 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

export function SocialIcon({
  name,
  className,
}: {
  name: AtharSocialKey
  className?: string
}) {
  switch (name) {
    case 'facebook':
      return <FacebookIcon className={className} />
    case 'instagram':
      return <InstagramIcon className={className} />
    case 'tiktok':
      return <TikTokIcon className={className} />
    case 'whatsapp':
      return <MessageCircle className={cn('size-4', className)} aria-hidden="true" />
  }
}
