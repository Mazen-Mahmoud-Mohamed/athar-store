import * as React from 'react'
import { cn } from '@/lib/utils'

function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & {
  variant?: 'default' | 'gold' | 'soft' | 'outline' | 'danger' | 'urgent'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium tracking-wide',
        variant === 'default' && 'bg-brown text-cream',
        variant === 'gold' && 'bg-gold/20 text-gold-deep',
        variant === 'soft' && 'bg-mist text-mocha',
        variant === 'outline' && 'border border-taupe/60 text-mocha',
        variant === 'danger' && 'bg-danger/10 text-danger',
        variant === 'urgent' &&
          'bg-gold-deep px-2.5 py-1 text-xs font-bold tracking-wide text-cream shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
