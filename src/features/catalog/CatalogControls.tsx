import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { CatalogSort } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import type { Category } from '@/types'

export type CatalogControlValues = {
  categorySlug: string
  sort: CatalogSort
  onlyNew: boolean
  onlyFeatured: boolean
  onlySale: boolean
  minPrice: string
  maxPrice: string
}

type CatalogControlsProps = {
  categories: Category[]
  values: CatalogControlValues
  resultCount: number
  onChange: (next: CatalogControlValues) => void
  onClear: () => void
  hideCategory?: boolean
  className?: string
}

const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: 'newest', label: 'أحدث المنتجات' },
  { value: 'price_asc', label: 'السعر: من الأقل للأعلى' },
  { value: 'price_desc', label: 'السعر: من الأعلى للأقل' },
  { value: 'name', label: 'الاسم' },
]

function FilterFields({
  categories,
  values,
  onChange,
  hideCategory,
}: {
  categories: Category[]
  values: CatalogControlValues
  onChange: (next: CatalogControlValues) => void
  hideCategory?: boolean
}) {
  return (
    <div className="space-y-5">
      {!hideCategory && categories.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs tracking-wide text-mocha">التصنيف</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!values.categorySlug ? 'default' : 'outline'}
              onClick={() => onChange({ ...values, categorySlug: '' })}
            >
              الكل
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                type="button"
                size="sm"
                variant={values.categorySlug === category.slug ? 'default' : 'outline'}
                onClick={() => onChange({ ...values, categorySlug: category.slug })}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-xs tracking-wide text-mocha">الترتيب</Label>
        <select
          value={values.sort}
          onChange={(e) => onChange({ ...values, sort: e.target.value as CatalogSort })}
          className="flex h-10 w-full rounded-md border border-taupe/45 bg-card px-3 text-sm text-brown focus-visible:outline-2 focus-visible:outline-gold"
          aria-label="ترتيب المنتجات"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs tracking-wide text-mocha">نطاق السعر (ج.م)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="من"
            value={values.minPrice}
            onChange={(e) => onChange({ ...values, minPrice: e.target.value })}
            aria-label="أقل سعر"
          />
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="إلى"
            value={values.maxPrice}
            onChange={(e) => onChange({ ...values, maxPrice: e.target.value })}
            aria-label="أعلى سعر"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs tracking-wide text-mocha">تصفية سريعة</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={values.onlyNew ? 'default' : 'outline'}
            onClick={() => onChange({ ...values, onlyNew: !values.onlyNew })}
          >
            جديد
          </Button>
          <Button
            type="button"
            size="sm"
            variant={values.onlyFeatured ? 'default' : 'outline'}
            onClick={() => onChange({ ...values, onlyFeatured: !values.onlyFeatured })}
          >
            مميز
          </Button>
          <Button
            type="button"
            size="sm"
            variant={values.onlySale ? 'default' : 'outline'}
            onClick={() => onChange({ ...values, onlySale: !values.onlySale })}
          >
            عروض
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CatalogControls({
  categories,
  values,
  resultCount,
  onChange,
  onClear,
  hideCategory = false,
  className,
}: CatalogControlsProps) {
  const [open, setOpen] = useState(false)
  const hasActiveFilters =
    Boolean(values.categorySlug) ||
    values.onlyNew ||
    values.onlyFeatured ||
    values.onlySale ||
    Boolean(values.minPrice) ||
    Boolean(values.maxPrice) ||
    values.sort !== 'newest'

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mocha" aria-live="polite">
          {resultCount} منتج
        </p>
        <div className="flex items-center gap-2">
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X className="size-3.5" />
              مسح التصفية
            </Button>
          ) : null}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="md:hidden">
                <Filter className="size-3.5" />
                تصفية وترتيب
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-cream">
              <SheetHeader>
                <SheetTitle>تصفية وترتيب</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <FilterFields
                  categories={categories}
                  values={values}
                  onChange={(next) => {
                    onChange(next)
                  }}
                  hideCategory={hideCategory}
                />
                <Button type="button" className="mt-6 w-full" onClick={() => setOpen(false)}>
                  عرض النتائج
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="hidden space-y-4 md:block">
        <FilterFields
          categories={categories}
          values={values}
          onChange={onChange}
          hideCategory={hideCategory}
        />
      </div>
    </div>
  )
}
