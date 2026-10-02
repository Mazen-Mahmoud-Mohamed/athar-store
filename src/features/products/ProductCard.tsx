import { Heart, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { Product } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCart } from '@/features/cart/cart-context'
import { calcDiscountPercent, cn, formatPrice } from '@/lib/utils'

type ProductCardProps = {
  product: Product
  className?: string
}

export function ProductCard({ product, className }: ProductCardProps) {
  const { addItem } = useCart()
  const [favorited, setFavorited] = useState(false)
  const discount = calcDiscountPercent(product.price, product.old_price)
  const outOfStock = product.stock_quantity <= 0

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-mist">
        <Link to={`/products/${product.id}`} className="block h-full w-full" aria-label={product.name}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
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
          {outOfStock ? <Badge variant="danger">نفد المخزون</Badge> : null}
        </div>

        <button
          type="button"
          aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          aria-pressed={favorited}
          onClick={() => setFavorited((v) => !v)}
          className="absolute end-3 top-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-mocha opacity-100 shadow-soft backdrop-blur-sm transition hover:text-brown md:opacity-0 md:group-hover:opacity-100"
        >
          <Heart className={cn('size-4', favorited && 'fill-danger text-danger')} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {product.category ? (
          <p className="text-[11px] tracking-wide text-mocha">{product.category.name}</p>
        ) : null}

        <Link to={`/products/${product.id}`} className="block">
          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-7 text-brown transition-colors group-hover:text-espresso">
            {product.name}
          </h3>
        </Link>

        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-base font-semibold text-brown">{formatPrice(product.price)}</p>
            {product.old_price ? (
              <p className="text-xs text-mocha line-through">{formatPrice(product.old_price)}</p>
            ) : null}
          </div>

          <Button
            size="icon"
            variant="soft"
            disabled={outOfStock}
            aria-label={`أضف ${product.name} إلى السلة`}
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
