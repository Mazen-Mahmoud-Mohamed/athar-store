/**
 * Client-side helpers for Supabase Storage image transforms.
 * Original public object URLs stay unchanged in the database/admin.
 * Falls back to the original URL for non-Supabase images.
 */

export type CatalogImagePreset = 'thumb' | 'card' | 'detail' | 'hero'

type TransformOptions = {
  width: number
  quality?: number
  format?: 'origin' | 'webp' | 'avif'
}

const OBJECT_PUBLIC = '/storage/v1/object/public/'
const RENDER_PUBLIC = '/storage/v1/render/image/public/'

/** Near-lossless display presets — sized for real rendered layouts. */
const PRESETS: Record<
  CatalogImagePreset,
  { widths: number[]; quality: number; sizes: string; widthAttr: number; heightAttr: number }
> = {
  thumb: {
    widths: [160, 320],
    quality: 82,
    sizes: '112px',
    widthAttr: 160,
    heightAttr: 160,
  },
  card: {
    // Cover 2-col mobile (~50vw @2x) and 4-col desktop without over-fetching originals.
    widths: [480, 640, 800],
    quality: 82,
    sizes: '(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 280px',
    widthAttr: 640,
    heightAttr: 800,
  },
  detail: {
    widths: [720, 960, 1200],
    quality: 85,
    sizes: '(max-width: 1024px) 100vw, 560px',
    widthAttr: 960,
    heightAttr: 1200,
  },
  hero: {
    widths: [720, 960, 1200],
    quality: 85,
    sizes: '(max-width: 1024px) 92vw, 520px',
    widthAttr: 960,
    heightAttr: 1200,
  },
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** Build a transformed Supabase Storage URL, or return the original. */
export function supabaseImageUrl(
  source: string | null | undefined,
  options: TransformOptions,
): string | null {
  if (!source) return null
  if (!isHttpUrl(source) || !source.includes(OBJECT_PUBLIC)) return source

  try {
    const url = new URL(source)
    if (!url.pathname.includes(OBJECT_PUBLIC)) return source

    url.pathname = url.pathname.replace(OBJECT_PUBLIC, RENDER_PUBLIC)
    url.search = ''
    url.searchParams.set('width', String(options.width))
    url.searchParams.set('quality', String(options.quality ?? 82))
    url.searchParams.set('resize', 'contain')
    url.searchParams.set('format', options.format ?? 'webp')
    return url.toString()
  } catch {
    return source
  }
}

export function catalogImageProps(
  source: string | null | undefined,
  preset: CatalogImagePreset,
): {
  src: string
  srcSet?: string
  sizes?: string
  width: number
  height: number
} | null {
  if (!source) return null

  const config = PRESETS[preset]
  const defaultWidth = config.widths[config.widths.length - 1]!
  const src =
    supabaseImageUrl(source, {
      width: defaultWidth,
      quality: config.quality,
      format: 'webp',
    }) ?? source

  // Non-Supabase / local assets: keep as-is without fake srcset.
  if (!source.includes(OBJECT_PUBLIC)) {
    return {
      src: source,
      width: config.widthAttr,
      height: config.heightAttr,
    }
  }

  const srcSet = config.widths
    .map((width) => {
      const url = supabaseImageUrl(source, {
        width,
        quality: config.quality,
        format: 'webp',
      })
      return url ? `${url} ${width}w` : null
    })
    .filter(Boolean)
    .join(', ')

  return {
    src,
    srcSet: srcSet || undefined,
    sizes: config.sizes,
    width: config.widthAttr,
    height: config.heightAttr,
  }
}
