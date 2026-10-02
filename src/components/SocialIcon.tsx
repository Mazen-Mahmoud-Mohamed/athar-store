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

function TikTokIcon({ className, ...props }: IconProps) {
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
      <path d="M14 4v10.2a3.8 3.8 0 1 1-2.6-3.6V8.2A6.2 6.2 0 0 0 16.8 12V9.3A6.2 6.2 0 0 1 14 4Z" />
      <path d="M14 4c.4 2.2 1.8 3.6 4 4" />
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
