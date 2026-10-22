import { useEffect, useRef, useState } from 'react'
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
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftMin, setDraftMin] = useState(values.minPrice)
  const [draftMax, setDraftMax] = useState(values.maxPrice)
  const filterAreaRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!compact || !filterOpen) return
    function handlePointerDown(event: PointerEvent) {
      if (filterAreaRef.current && !filterAreaRef.current.contains(event.target as Node)) {
        setFilterOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFilterOpen(false)
        filterButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [compact, filterOpen])

  const priceInvalid =
    draftMin.trim() !== '' &&
    draftMax.trim() !== '' &&
    Number(draftMin) > Number(draftMax)

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

          {/* A small anchored panel on desktop; no full-screen dialog for price filters. */}
          <div ref={filterAreaRef} className="relative shrink-0">
            <Button
              ref={filterButtonRef}
              type="button"
              variant={values.minPrice || values.maxPrice ? 'soft' : 'outline'}
              size="sm"
              className="gap-2 rounded-lg"
              aria-expanded={filterOpen}
              aria-controls="products-filter-panel"
              onClick={() => {
                if (!filterOpen) {
                  setDraftMin(values.minPrice)
                  setDraftMax(values.maxPrice)
                }
                setFilterOpen(current => !current)
              }}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">تصفية السعر</span>
              <span className="sm:hidden">تصفية</span>
              {(values.minPrice || values.maxPrice) && (
                <span className="size-1.5 rounded-full bg-gold-deep" aria-hidden="true" />
              )}
            </Button>

            {filterOpen && (
              <div
                className="fixed inset-0 z-[60] bg-espresso/35 backdrop-blur-[1px] sm:hidden"
                aria-hidden="true"
                onClick={() => setFilterOpen(false)}
              />
            )}
            {filterOpen && (
              <div
                id="products-filter-panel"
                role="region"
                aria-label="خيارات التصفية"
                className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] max-h-[min(80dvh,36rem)] overflow-y-auto overscroll-contain rounded-2xl border border-taupe/40 bg-card p-4 shadow-[0_18px_50px_rgba(47,33,24,0.17)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:z-40 sm:mt-2 sm:w-[22rem] sm:max-h-[min(75vh,36rem)] sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-semibold text-brown">تصفية المنتجات</p>
                    <p className="mt-1 text-xs text-mocha">حددي السعر المناسب ليكي</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-mocha hover:bg-mist hover:text-brown"
                    aria-label="إغلاق التصفية"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <form
                  onSubmit={event => {
                    event.preventDefault()
                    if (priceInvalid) return
                    onChange({ ...values, minPrice: draftMin, maxPrice: draftMax })
                    setFilterOpen(false)
                  }}
                  className="space-y-4"
                >
                  <div>
                    <Label className="mb-2 block text-sm font-medium text-brown">نطاق السعر (ج.م)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1.5 block text-xs text-mocha" htmlFor="catalog-price-min">من</Label>
                        <Input id="catalog-price-min" type="number" min={0} step="any" inputMode="decimal"
                          value={draftMin} onChange={event => setDraftMin(event.target.value)}
                          placeholder="أقل سعر" />
                      </div>
                      <div>
                        <Label className="mb-1.5 block text-xs text-mocha" htmlFor="catalog-price-max">إلى</Label>
                        <Input id="catalog-price-max" type="number" min={0} step="any" inputMode="decimal"
                          value={draftMax} onChange={event => setDraftMax(event.target.value)}
                          placeholder="أعلى سعر" />
                      </div>
                    </div>
                    {priceInvalid && (
                      <p className="mt-2 text-xs text-danger" role="alert">أقصى سعر لازم يكون أكبر من أو يساوي أقل سعر.</p>
                    )}
                  </div>

                  {/* Desktop already shows sorting and quick filters in the toolbar. */}
                  <div className="space-y-2 md:hidden">
                    <Label className="text-xs text-mocha">ترتيب المنتجات</Label>
                    <select
                      value={values.sort}
                      onChange={event => onChange({ ...values, sort: event.target.value as CatalogSort })}
                      className="h-10 w-full rounded-md border border-taupe/45 bg-card px-3 text-sm text-brown"
                      aria-label="ترتيب المنتجات"
                    >
                      {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2 sm:hidden">
                    <Label className="text-xs text-mocha">تصفية سريعة</Label>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['onlyNew', 'جديد'],
                        ['onlyFeatured', 'مميز'],
                        ['onlySale', 'عروض'],
                      ] as const).map(([key, label]) => (
                        <Button key={key} type="button" size="sm"
                          variant={values[key] ? 'default' : 'outline'}
                          aria-pressed={values[key]} className="rounded-full"
                          onClick={() => onChange({ ...values, [key]: !values[key] })}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-taupe/25 pt-4">
                    <Button type="submit" className="flex-1" disabled={priceInvalid}>
                      عرض {resultCountLoading ? 'النتائج' : `${resultCount} منتج`}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                      setDraftMin('')
                      setDraftMax('')
                      onChange({ ...values, minPrice: '', maxPrice: '' })
                    }}>
                      مسح السعر
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
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
