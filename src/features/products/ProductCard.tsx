import { ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { Product } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCart } from '@/features/cart/cart-context'
import { productPath } from '@/config/site'
import { calcDiscountPercent, cn, formatPrice } from '@/lib/utils'

type ProductCardProps = {
  product: Product
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { addItem } = useCart()
  const [imgFailed, setImgFailed] = useState(false)
  const discount = calcDiscountPercent(product.price, product.old_price)
  const outOfStock = product.stock_quantity <= 0
  const showImage = Boolean(product.image_url) && !imgFailed

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg bg-card transition-transform duration-300 hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-mist">
        <Link to={productPath(product)} className="block h-full w-full" aria-label={product.name}>
          {showImage ? (
            <img
              src={product.image_url!}
              alt={product.name}
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-mist via-ivory to-sand/80 p-6 text-center">
              <span className="font-display text-3xl font-semibold text-brown/25">أثر</span>
              <span className="text-xs tracking-[0.2em] text-mocha/50">BAGS</span>
            </div>
          )}
        </Link>

        <div className="absolute start-3 top-3 flex flex-col gap-1.5">
          {discount ? (
            <Badge variant="gold" className="backdrop-blur-sm">
              خصم {discount}%
            </Badge>
          ) : null}
          {product.is_new ? <Badge variant="soft">جديد</Badge> : null}
          {product.is_featured ? (
            <Badge variant="outline" className="border-cream/40 bg-card/90 text-brown">
              مميز
            </Badge>
          ) : null}
          {outOfStock ? <Badge variant="danger">غير متوفر</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:gap-3 sm:p-4">
        {product.category ? (
          <p className="text-[11px] tracking-wide text-mocha">{product.category.name}</p>
        ) : null}

        <Link to={productPath(product)} className="block">
          <h3 className="line-clamp-2 font-display text-[14px] font-semibold leading-7 text-brown transition-colors group-hover:text-espresso sm:text-[15px]">
            {product.name}
          </h3>
        </Link>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-brown sm:text-base">{formatPrice(product.price)}</p>
            {product.old_price && product.old_price > product.price ? (
              <p className="text-xs text-mocha line-through">{formatPrice(product.old_price)}</p>
            ) : null}
          </div>

          <Button
            size="icon"
            variant="soft"
            disabled={outOfStock}
            aria-label={`أضيفي ${product.name} إلى السلة`}
            className="size-9 shrink-0 sm:size-10"
            onClick={() =>
              addItem({
                productId: product.id,
                name: product.name,
                price: product.price,
                imageUrl: product.image_url,
                slug: product.slug,
              })
            }
          >
            <ShoppingBag />
          </Button>
        </div>
      </div>
    </article>
  )
}
