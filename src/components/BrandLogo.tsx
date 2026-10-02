import atharLogo from '@/assets/athar-logo.png'
import { cn } from '@/lib/utils'

type BrandLogoProps = {
  className?: string
  imgClassName?: string
  alt?: string
  priority?: boolean
}

export function BrandLogo({
  className,
  imgClassName,
  alt = 'أثر — شعار العلامة',
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={atharLogo}
        alt={alt}
        width={160}
        height={160}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        className={cn('h-auto w-full object-contain', imgClassName)}
      />
    </span>
  )
}
