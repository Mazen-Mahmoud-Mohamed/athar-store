import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { Category } from '@/types'
import { catalogImageProps } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

type CategoryCardProps = {
  category: Category
  productCount?: number
  className?: string
}

const accents = [
  'from-[#efe6da] to-[#e4d5c4]',
  'from-[#ebe0d2] to-[#dcc9b5]',
  'from-[#f0e7dc] to-[#e8d5cb]',
  'from-[#ebe3d6] to-[#d7c5b0]',
]

export function CategoryCard({ category, productCount, className }: CategoryCardProps) {
  const accent = accents[category.sort_order % accents.length]
  const [imgMode, setImgMode] = useState<'optimized' | 'original' | 'failed'>('optimized')
  const image =
    imgMode === 'failed'
      ? null
      : imgMode === 'original' && category.image_url
        ? { src: category.image_url, width: 640, height: 800 }
        : catalogImageProps(category.image_url, 'card')

  return (
    <Link
      to={`/category/${category.slug}`}
      className={cn(
        'group relative block overflow-hidden rounded-lg transition-transform duration-300 hover:-translate-y-0.5',
        className,
      )}
      aria-label={
        productCount != null
          ? `${category.name} — ${productCount} منتج`
          : category.name
      }
    >
      <div className={cn('aspect-[4/5] bg-gradient-to-br', accent)}>
        {image ? (
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes={image.sizes}
            alt={`تصنيف ${category.name}`}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
            onError={() =>
              setImgMode((mode) =>
                mode === 'optimized' && category.image_url ? 'original' : 'failed',
              )
            }
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-end p-5">
            <span className="font-display text-4xl font-light text-brown/15">أثر</span>
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-espresso/60 via-espresso/25 to-transparent p-4 pt-16 text-cream">
        <h3 className="font-display text-lg font-semibold">{category.name}</h3>
        {productCount != null ? (
          <p className="mt-1 text-xs text-cream/80">{productCount} منتج</p>
        ) : category.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-cream/80">{category.description}</p>
        ) : null}
      </div>
    </Link>
  )
}
