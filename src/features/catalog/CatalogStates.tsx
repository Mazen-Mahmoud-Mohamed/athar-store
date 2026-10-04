import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function ProductGridSkeleton({
  count = 8,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4', className)}
      aria-busy="true"
      aria-label="جارٍ تحميل المنتجات"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg bg-card" aria-hidden="true">
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <div className="space-y-2.5 p-3.5 sm:p-4">
            <Skeleton className="h-2.5 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex items-end justify-between gap-2 pt-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="size-9 shrink-0 rounded-md sm:size-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CategoryGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4"
      aria-busy="true"
      aria-label="جارٍ تحميل التصنيفات"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-lg"
          aria-hidden="true"
        >
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-4 pt-16">
            <Skeleton className="h-4 w-2/3 bg-cream/40" />
            <Skeleton className="h-3 w-1/3 bg-cream/30" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function HeroMediaSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn('aspect-[4/5] w-full rounded-none', className)}
      aria-hidden="true"
    />
  )
}

export function ProductDetailsSkeleton() {
  return (
    <div
      className="container-athar py-8 sm:py-12"
      aria-busy="true"
      aria-label="جارٍ تحميل المنتج"
    >
      <Skeleton className="mb-6 h-4 w-48" aria-hidden="true" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-[4/5] w-full rounded-xl" aria-hidden="true" />
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-5 w-36" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-12 min-w-44 flex-1 sm:flex-none" />
          </div>
        </div>
      </div>
    </div>
  )
}

type CatalogEmptyProps = {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  secondaryLabel?: string
  secondaryTo?: string
  /** Visual tone — unavailable is slightly stronger than a calm empty state. */
  tone?: 'empty' | 'unavailable'
  /** Use h1 when this empty state is the page’s primary heading. */
  titleAs?: 'h1' | 'h2'
  className?: string
}

/** Successful load with nothing to show, or a missing/unavailable resource. */
export function CatalogEmpty({
  title,
  description,
  actionLabel = 'عرض كل المنتجات',
  actionTo = '/products',
  onAction,
  secondaryLabel,
  secondaryTo,
  tone = 'empty',
  titleAs = 'h2',
  className,
}: CatalogEmptyProps) {
  const TitleTag = titleAs
  return (
    <div
      className={cn(
        'px-6 py-14 text-center',
        tone === 'unavailable'
          ? 'rounded-xl border border-taupe/40 bg-mist/50'
          : 'rounded-xl border border-dashed border-taupe/45 bg-card/70',
        className,
      )}
      role={tone === 'unavailable' ? 'status' : undefined}
    >
      <TitleTag className="font-display text-xl font-semibold text-brown">{title}</TitleTag>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-mocha">{description}</p>
      ) : null}
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        {onAction ? (
          <Button type="button" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        )}
        {secondaryLabel && secondaryTo ? (
          <Button asChild variant="ghost">
            <Link to={secondaryTo}>{secondaryLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

type CatalogErrorProps = {
  title?: string
  message: string
  onRetry?: () => void
  secondaryLabel?: string
  secondaryTo?: string
  className?: string
}

/** Failed load — never use this for an intentional empty result. */
export function CatalogError({
  title = 'تعذر التحميل',
  message,
  onRetry,
  secondaryLabel = 'العودة للرئيسية',
  secondaryTo = '/',
  className,
}: CatalogErrorProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-danger/20 bg-danger/5 px-6 py-10 text-center',
        className,
      )}
      role="alert"
    >
      <h2 className="font-display text-lg font-semibold text-brown">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-mocha">{message}</p>
      <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        ) : null}
        {secondaryLabel && secondaryTo ? (
          <Button asChild variant="ghost">
            <Link to={secondaryTo}>{secondaryLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
