import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/utils'
import { adminGetAllCategories } from '@/services/categoryService'
import {
  adminDeleteProduct,
  adminGetAllProducts,
  adminPatchProduct,
} from '@/services/productService'
import type { Category, Product } from '@/types'
import { toast } from 'sonner'

type ActiveFilter = 'all' | 'active' | 'inactive'
type SortKey = 'updated_desc' | 'name_asc' | 'price_asc' | 'price_desc' | 'stock_asc'

function productStatus(product: Product): { label: string; variant: 'soft' | 'danger' | 'gold' } {
  if (!product.is_active) return { label: 'غير متاح', variant: 'danger' }
  if (product.stock_quantity <= 0) return { label: 'نفد المخزون', variant: 'gold' }
  return { label: 'متاح', variant: 'soft' }
}

export function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [sort, setSort] = useState<SortKey>('updated_desc')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  async function reload() {
    const [productRows, categoryRows] = await Promise.all([
      adminGetAllProducts(),
      adminGetAllCategories(),
    ])
    setProducts(productRows)
    setCategories(categoryRows)
    setError(null)
  }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        await reload()
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل المنتجات'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = products.filter((product) => {
      if (categoryId !== 'all' && product.category_id !== categoryId) return false
      if (activeFilter === 'active' && !product.is_active) return false
      if (activeFilter === 'inactive' && product.is_active) return false
      if (!q) return true
      return (
        product.name.toLowerCase().includes(q) ||
        (product.category?.name.toLowerCase().includes(q) ?? false)
      )
    })

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'ar')
        case 'price_asc':
          return a.price - b.price
        case 'price_desc':
          return b.price - a.price
        case 'stock_asc':
          return a.stock_quantity - b.stock_quantity
        case 'updated_desc':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
    })

    return rows
  }, [products, search, categoryId, activeFilter, sort])

  async function toggleAvailability(product: Product) {
    setBusyId(product.id)
    try {
      const updated = await adminPatchProduct(product.id, { is_active: !product.is_active })
      setProducts((prev) => prev.map((row) => (row.id === product.id ? updated : row)))
      toast.success(updated.is_active ? 'المنتج متاح الآن في المتجر' : 'تم إخفاء المنتج من المتجر')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر تحديث المنتج'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await adminDeleteProduct(deleteTarget.id)
      setProducts((prev) => prev.filter((row) => row.id !== deleteTarget.id))
      toast.success('تم حذف المنتج')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر حذف المنتج'))
    } finally {
      setBusyId(null)
    }
  }

  function ProductActions({ product }: { product: Product }) {
    const busy = busyId === product.id
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/products/${product.id}/edit`}>تعديل</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void toggleAvailability(product)}
        >
          {product.is_active ? 'إخفاء' : 'إظهار'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger hover:text-danger"
          disabled={busy}
          onClick={() => setDeleteTarget(product)}
        >
          حذف
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageMeta title="إدارة المنتجات" path="/admin/products" noIndex />
      <div className="space-y-6">
        <AdminPageHeader
          title="المنتجات"
          description="أضيفي وعدّلي منتجات متجرك بسهولة"
          actions={
            <Button asChild>
              <Link to="/admin/products/new">+ إضافة منتج</Link>
            </Button>
          }
        />

        <div className="grid gap-3 rounded-xl border border-taupe/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs text-mocha" htmlFor="product-search">
              البحث
            </label>
            <Input
              id="product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-mocha" htmlFor="product-category">
              التصنيف
            </label>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-11 w-full rounded-md border border-taupe/50 bg-card px-3 text-sm"
            >
              <option value="all">كل التصنيفات</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-mocha" htmlFor="product-active">
              الحالة
            </label>
            <select
              id="product-active"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="flex h-11 w-full rounded-md border border-taupe/50 bg-card px-3 text-sm"
            >
              <option value="all">الكل</option>
              <option value="active">متاح فقط</option>
              <option value="inactive">غير متاح</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <label className="text-xs text-mocha" htmlFor="product-sort">
              الترتيب
            </label>
            <select
              id="product-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="flex h-11 w-full max-w-md rounded-md border border-taupe/50 bg-card px-3 text-sm"
            >
              <option value="updated_desc">الأحدث تحديثاً</option>
              <option value="name_asc">الاسم</option>
              <option value="price_asc">السعر: من الأقل</option>
              <option value="price_desc">السعر: من الأعلى</option>
              <option value="stock_asc">الكمية: الأقل أولاً</option>
            </select>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-mocha" aria-live="polite">
            جارٍ تحميل المنتجات...
          </p>
        ) : filtered.length === 0 ? (
          <AdminEmptyState
            title={products.length === 0 ? 'لا توجد منتجات حاليًا' : 'لا نتائج مطابقة'}
            description={
              products.length === 0
                ? 'ابدأ بإضافة أول منتج إلى متجرك.'
                : 'جرّبي تعديل البحث أو التصنيف أو الحالة.'
            }
            action={
              products.length === 0 ? (
                <Button asChild>
                  <Link to="/admin/products/new">+ إضافة منتج</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {filtered.map((product) => {
                const status = productStatus(product)
                return (
                  <article
                    key={product.id}
                    className="rounded-xl border border-taupe/40 bg-card p-4"
                  >
                    <div className="flex gap-3">
                      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-mist">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-mocha/50">
                            بلا صورة
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-brown">{product.name}</p>
                        <p className="mt-1 text-xs text-mocha">
                          {product.category?.name ?? 'بدون تصنيف'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {formatPrice(product.price)}
                          </span>
                          <Badge variant={status.variant}>{status.label}</Badge>
                          <span className="text-xs text-mocha">
                            الكمية: {product.stock_quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-taupe/30 pt-3">
                      <ProductActions product={product} />
                    </div>
                  </article>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border border-taupe/40 bg-card md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-mist/80 text-mocha">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">المنتج</th>
                      <th className="px-4 py-3 text-start font-medium">التصنيف</th>
                      <th className="px-4 py-3 text-start font-medium">السعر</th>
                      <th className="px-4 py-3 text-start font-medium">الكمية</th>
                      <th className="px-4 py-3 text-start font-medium">الحالة</th>
                      <th className="px-4 py-3 text-start font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => {
                      const status = productStatus(product)
                      return (
                        <tr key={product.id} className="border-t border-taupe/30 align-middle">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="size-14 shrink-0 overflow-hidden rounded-md bg-mist">
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[10px] text-mocha/50">
                                    بلا صورة
                                  </div>
                                )}
                              </div>
                              <p className="font-medium text-brown">{product.name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-mocha">
                            {product.category?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{formatPrice(product.price)}</p>
                            {product.old_price != null ? (
                              <p className="text-xs text-mocha line-through">
                                {formatPrice(product.old_price)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{product.stock_quantity}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant={status.variant}>{status.label}</Badge>
                              {product.is_featured ? (
                                <Badge variant="gold">مميز</Badge>
                              ) : null}
                              {product.is_new ? <Badge variant="outline">جديد</Badge> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <ProductActions product={product} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="حذف المنتج؟"
        description={`هل أنت متأكد من حذف «${deleteTarget?.name ?? ''}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف المنتج"
        destructive
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
