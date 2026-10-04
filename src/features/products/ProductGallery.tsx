import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { catalogImageProps } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

export type ProductGalleryProps = {
  /** Ordered gallery URLs. Today this is usually a single `image_url`. */
  images: string[]
  productName: string
  className?: string
}

type ImgMode = 'optimized' | 'original' | 'failed'

/** Normalize current product fields into a gallery list without inventing images. */
export function resolveProductGalleryImages(imageUrl: string | null | undefined): string[] {
  if (!imageUrl?.trim()) return []
  return [imageUrl.trim()]
}

function GalleryFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-mist via-ivory to-sand/80',
        className,
      )}
      aria-hidden="true"
    >
      <span className="font-display text-5xl font-semibold text-brown/20">أثر</span>
      <span className="text-xs tracking-[0.25em] text-mocha/40">BAGS</span>
    </div>
  )
}

function useResolvedImage(source: string | null, preset: 'detail' | 'thumb' | 'hero') {
  const [mode, setMode] = useState<ImgMode>('optimized')
  const [seenSource, setSeenSource] = useState(source)

  if (source !== seenSource) {
    setSeenSource(source)
    setMode('optimized')
  }

  if (!source || mode === 'failed') {
    return {
      props: null as ReturnType<typeof catalogImageProps>,
      onError: () => setMode('failed'),
    }
  }

  if (mode === 'original') {
    return {
      props: {
        src: source,
        width: preset === 'thumb' ? 160 : 960,
        height: preset === 'thumb' ? 160 : 1200,
      },
      onError: () => setMode('failed'),
    }
  }

  return {
    props: catalogImageProps(source, preset),
    onError: () => setMode((current) => (current === 'optimized' ? 'original' : 'failed')),
  }
}

export function ProductGallery({ images, productName, className }: ProductGalleryProps) {
  const labelId = useId()
  const safeImages = images.filter((url) => Boolean(url?.trim()))
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const multi = safeImages.length > 1
  const clampedIndex = Math.min(activeIndex, Math.max(safeImages.length - 1, 0))
  const activeSrc = safeImages[clampedIndex] ?? null
  const main = useResolvedImage(activeSrc, 'detail')
  const lightbox = useResolvedImage(activeSrc, 'detail')

  function selectIndex(next: number) {
    if (safeImages.length === 0) return
    const wrapped = (next + safeImages.length) % safeImages.length
    setActiveIndex(wrapped)
  }

  const alt = productName.trim() || 'منتج أثر'

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="relative overflow-hidden rounded-xl bg-mist"
        role="group"
        aria-labelledby={labelId}
      >
        <p id={labelId} className="sr-only">
          {multi
            ? `صور المنتج، الصورة ${clampedIndex + 1} من ${safeImages.length}`
            : 'صورة المنتج'}
        </p>

        <div className="aspect-[4/5]">
          {main.props ? (
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="group relative block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
                  aria-label={`تكبير صورة ${alt}`}
                >
                  <img
                    src={main.props.src}
                    srcSet={'srcSet' in main.props ? main.props.srcSet : undefined}
                    sizes={
                      'sizes' in main.props
                        ? (main.props.sizes ?? '(max-width: 1024px) 100vw, 560px')
                        : '(max-width: 1024px) 100vw, 560px'
                    }
                    alt={alt}
                    width={main.props.width}
                    height={main.props.height}
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={main.onError}
                  />
                  <span
                    className="pointer-events-none absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-md bg-cream/90 px-2.5 py-1.5 text-xs font-medium text-brown opacity-90 shadow-soft transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <Expand className="size-3.5" />
                    تكبير
                  </span>
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(92dvh,920px)] w-[min(96vw,880px)] max-w-none overflow-hidden border-taupe/30 bg-cream p-3 sm:p-4">
                <DialogTitle className="sr-only">{alt}</DialogTitle>
                <DialogDescription className="sr-only">
                  عرض مكبّر لصورة المنتج. اضغطي Escape للإغلاق.
                </DialogDescription>
                <div className="mx-auto flex max-h-[calc(92dvh-3.5rem)] items-center justify-center bg-mist">
                  {lightbox.props ? (
                    <img
                      src={lightbox.props.src}
                      srcSet={'srcSet' in lightbox.props ? lightbox.props.srcSet : undefined}
                      sizes="(max-width: 880px) 96vw, 840px"
                      alt={alt}
                      width={lightbox.props.width}
                      height={lightbox.props.height}
                      decoding="async"
                      className="max-h-[calc(92dvh-3.5rem)] w-auto max-w-full object-contain"
                      onError={lightbox.onError}
                    />
                  ) : (
                    <div className="aspect-[4/5] w-full max-w-md">
                      <GalleryFallback />
                    </div>
                  )}
                </div>
                {multi ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-md text-brown transition hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
                      aria-label="الصورة السابقة"
                      onClick={() => selectIndex(clampedIndex - 1)}
                    >
                      <ChevronRight className="size-5" aria-hidden="true" />
                    </button>
                    <p className="text-xs text-mocha" aria-live="polite">
                      {clampedIndex + 1} / {safeImages.length}
                    </p>
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-md text-brown transition hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
                      aria-label="الصورة التالية"
                      onClick={() => selectIndex(clampedIndex + 1)}
                    >
                      <ChevronLeft className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>
          ) : (
            <GalleryFallback />
          )}
        </div>

        {multi ? (
          <>
            <button
              type="button"
              className="absolute start-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-md bg-cream/90 text-brown shadow-soft transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
              aria-label="الصورة السابقة"
              onClick={() => selectIndex(clampedIndex - 1)}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="absolute end-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-md bg-cream/90 text-brown shadow-soft transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
              aria-label="الصورة التالية"
              onClick={() => selectIndex(clampedIndex + 1)}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {multi ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="مصغرات صور المنتج">
          {safeImages.map((url, index) => (
            <li key={`${url}-${index}`} className="shrink-0">
              <ThumbnailButton
                source={url}
                productName={alt}
                index={index}
                selected={index === clampedIndex}
                onSelect={() => setActiveIndex(index)}
              />
            </li>
          ))}
        </ul>
      ) : null}

    </div>
  )
}

function ThumbnailButton({
  source,
  productName,
  index,
  selected,
  onSelect,
}: {
  source: string
  productName: string
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const thumb = useResolvedImage(source, 'thumb')

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`عرض صورة ${index + 1} لـ ${productName}`}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'block size-16 overflow-hidden rounded-md bg-mist transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown sm:size-[4.5rem]',
        selected ? 'ring-2 ring-brown ring-offset-2 ring-offset-cream' : 'ring-1 ring-taupe/35',
      )}
    >
      {thumb.props ? (
        <img
          src={thumb.props.src}
          srcSet={'srcSet' in thumb.props ? thumb.props.srcSet : undefined}
          sizes="72px"
          alt=""
          width={thumb.props.width}
          height={thumb.props.height}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={thumb.onError}
        />
      ) : (
        <GalleryFallback className="gap-1 [&_span:first-child]:text-2xl" />
      )}
    </button>
  )
}
