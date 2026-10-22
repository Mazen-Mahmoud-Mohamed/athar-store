import { useState } from 'react'
import { Filter, SlidersHorizontal, X } from 'lucide-react'
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
  resultCountLoading?: boolean
  onChange: (next: CatalogControlValues) => void
  onClear: () => void
  hideCategory?: boolean
  compact?: boolean
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
              aria-pressed={!values.categorySlug}
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
                aria-pressed={values.categorySlug === category.slug}
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
          className="flex h-10 w-full rounded-md border border-taupe/45 bg-card px-3 text-sm text-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
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
            aria-pressed={values.onlyNew}
            onClick={() => onChange({ ...values, onlyNew: !values.onlyNew })}
          >
            جديد
          </Button>
          <Button
            type="button"
            size="sm"
            variant={values.onlyFeatured ? 'default' : 'outline'}
            aria-pressed={values.onlyFeatured}
            onClick={() => onChange({ ...values, onlyFeatured: !values.onlyFeatured })}
          >
            مميز
          </Button>
          <Button
            type="button"
            size="sm"
            variant={values.onlySale ? 'default' : 'outline'}
            aria-pressed={values.onlySale}
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
  resultCountLoading = false,
  onChange,
  onClear,
  hideCategory = false,
  compact = false,
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

  if (compact) {
    return (
      <div className={cn('space-y-4', className)}>
        {!hideCategory && categories.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-mocha">التصنيف</span>
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" aria-label="تصفية حسب التصنيف">
              {[{ id: 'all', name: 'كل المنتجات', slug: '' }, ...categories].map(category => (
                <Button key={category.id} type="button" size="sm"
                  variant={values.categorySlug === category.slug ? 'default' : 'outline'}
                  aria-pressed={values.categorySlug === category.slug}
                  className="shrink-0 rounded-full px-4"
                  onClick={() => onChange({ ...values, categorySlug: category.slug })}>
                  {category.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-taupe/35 bg-card/80 p-3 shadow-soft sm:gap-3 sm:p-4">
          <p className="me-auto shrink-0 text-sm font-medium text-brown" aria-live="polite">
            {resultCountLoading ? 'جارٍ التحميل…' : `${resultCount} منتج`}
          </p>

          <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
            {([
              ['onlyNew', 'جديد'],
              ['onlyFeatured', 'مميز'],
              ['onlySale', 'عروض'],
            ] as const).map(([key, label]) => (
              <Button key={key} type="button" variant={values[key] ? 'default' : 'outline'}
                size="sm" aria-pressed={values[key]} className="rounded-full"
                onClick={() => onChange({ ...values, [key]: !values[key] })}>
                {label}
              </Button>
            ))}
          </div>

          <label className="hidden items-center gap-2 text-xs text-mocha md:flex">
            <span className="shrink-0">الترتيب</span>
            <select value={values.sort} aria-label="ترتيب المنتجات"
              onChange={e => onChange({ ...values, sort: e.target.value as CatalogSort })}
              className="h-9 max-w-44 rounded-md border border-taupe/40 bg-card px-2 text-xs text-brown focus-visible:outline-2 focus-visible:outline-brown">
              {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span>كل الفلاتر</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-cream">
              <SheetHeader><SheetTitle>تصفية وترتيب</SheetTitle></SheetHeader>
              <div className="mt-5">
                <FilterFields categories={categories} values={values} onChange={onChange} hideCategory={hideCategory} />
                <Button type="button" className="mt-5 w-full" onClick={() => setOpen(false)}>عرض {resultCountLoading ? 'النتائج' : `${resultCount} منتج`}</Button>
              </div>
            </SheetContent>
          </Sheet>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="text-mocha" onClick={onClear}>
              <X className="size-3.5" aria-hidden="true" />
              <span>مسح</span>
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mocha" aria-live="polite">
          {resultCountLoading ? 'جارٍ التحميل...' : `${resultCount} منتج`}
        </p>
        <div className="flex items-center gap-2">
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X className="size-3.5" aria-hidden="true" />
              مسح التصفية
            </Button>
          ) : null}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="md:hidden">
                <Filter className="size-3.5" aria-hidden="true" />
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
