import { atharContact } from '@/config/contact'
import { cn } from '@/lib/utils'

type StoreLocationMapProps = {
  className?: string
}

/** Google Maps preview for the Footer map column. */
export function StoreLocationMap({ className }: StoreLocationMapProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative h-[180px] w-full overflow-hidden rounded-lg border border-cream/15 bg-espresso/50 sm:h-[190px] lg:h-[200px]">
        <iframe
          title="موقع أثر على خرائط جوجل"
          src={atharContact.mapsEmbedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <a
        href={atharContact.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm text-gold-soft transition-colors hover:text-cream"
      >
        عرض الموقع على الخريطة
      </a>
    </div>
  )
}
