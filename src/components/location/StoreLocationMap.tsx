import { atharContact } from '@/config/contact'
import { cn } from '@/lib/utils'

type StoreLocationMapProps = {
  className?: string
}

/** Compact Google Maps preview for the Footer contact column only. */
export function StoreLocationMap({ className }: StoreLocationMapProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative h-[210px] w-full overflow-hidden rounded-md border border-cream/15 bg-espresso/50 sm:h-[170px] sm:max-w-[340px]">
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
        className="text-[11px] text-gold-soft transition-colors hover:text-cream"
      >
        عرض الموقع على الخريطة
      </a>
    </div>
  )
}
