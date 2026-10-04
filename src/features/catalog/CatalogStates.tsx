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

export function CatalogEmpty({
  title,
  description,
  actionLabel = 'عرض كل المنتجات',
  actionTo = '/products',
}: {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-taupe/45 bg-card/70 px-6 py-14 text-center">
      <p className="font-display text-xl text-brown">{title}</p>
      {description ? <p className="mt-2 text-sm leading-7 text-mocha">{description}</p> : null}
      <Button asChild variant="outline" className="mt-6">
        <Link to={actionTo}>{actionLabel}</Link>
      </Button>
    </div>
  )
}

export function CatalogError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 px-6 py-10 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-5" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  )
}
