import atharLogo from '@/assets/athar-logo.png'
import { cn } from '@/lib/utils'

type BrandLogoProps = {
  className?: string
  imgClassName?: string
  alt?: string
  priority?: boolean
  /** Override logo asset (e.g. transparent mark for dark surfaces). */
  src?: string
}

export function BrandLogo({
  className,
  imgClassName,
  alt = 'أثر — شعار العلامة',
  priority = false,
  src = atharLogo,
}: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={src}
        alt={alt}
        width={160}
        height={160}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        className={cn('h-auto w-full object-contain', imgClassName)}
      />
    </span>
  )
}
