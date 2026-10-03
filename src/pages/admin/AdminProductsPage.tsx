import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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

function formatUpdatedAt(value: string) {
  try {
    return new Date(value).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
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
        product.slug.toLowerCase().includes(q) ||
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

  async function patchFlag(
    product: Product,
    field: 'is_active' | 'is_featured' | 'is_new',
    value: boolean,
  ) {
    setBusyId(product.id)
    try {
      const updated = await adminPatchProduct(product.id, { [field]: value })
      setProducts((prev) => prev.map((row) => (row.id === product.id ? updated : row)))
      toast.success('تم تحديث المنتج')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر تحديث المنتج'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`هل تريدين حذف المنتج «${product.name}»؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return
    }

    setBusyId(product.id)
    try {
      await adminDeleteProduct(product.id)
      setProducts((prev) => prev.filter((row) => row.id !== product.id))
      toast.success('تم حذف المنتج')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر حذف المنتج'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageMeta title="إدارة المنتجات" path="/admin/products" noIndex />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">المنتجات</h1>
            <p className="mt-2 text-sm text-mocha">إدارة كتالوج أثر بالكامل عبر Supabase</p>
          </div>
          <Button asChild>
            <Link to="/admin/products/new">منتج جديد</Link>
          </Button>
        </div>

        <div className="grid gap-3 rounded-xl border border-taupe/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs text-mocha" htmlFor="product-search">
              بحث بالاسم
            </label>
            <Input
              id="product-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحثي عن منتج..."
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
              <option value="active">نشط فقط</option>
              <option value="inactive">غير نشط</option>
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
              <option value="stock_asc">المخزون: الأقل أولاً</option>
            </select>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-taupe/40 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-mist/80 text-mocha">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">المنتج</th>
                  <th className="px-4 py-3 text-start font-medium">التصنيف</th>
                  <th className="px-4 py-3 text-start font-medium">السعر</th>
                  <th className="px-4 py-3 text-start font-medium">المخزون</th>
                  <th className="px-4 py-3 text-start font-medium">الحالات</th>
                  <th className="px-4 py-3 text-start font-medium">آخر تحديث</th>
                  <th className="px-4 py-3 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-mocha">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <p className="font-display text-base text-brown">
                        {products.length === 0 ? 'لا توجد منتجات بعد' : 'لا نتائج مطابقة للبحث'}
                      </p>
                      <p className="mt-2 text-sm text-mocha">
                        {products.length === 0
                          ? 'أضيفي أول منتج لبدء الكتالوج.'
                          : 'جرّبي تعديل فلاتر البحث أو التصنيف.'}
                      </p>
                      {products.length === 0 ? (
                        <Button asChild className="mt-5">
                          <Link to="/admin/products/new">إضافة منتج</Link>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  filtered.map((product) => (
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
                          <div className="min-w-0">
                            <p className="font-medium text-brown">{product.name}</p>
                            <p className="mt-0.5 truncate text-xs text-mocha/70" dir="ltr">
                              {product.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-mocha">
                        {product.category?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="font-medium">{formatPrice(product.price)}</p>
                          {product.old_price != null ? (
                            <p className="text-xs text-mocha line-through">
                              {formatPrice(product.old_price)}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{product.stock_quantity}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={product.is_active ? 'soft' : 'danger'}>
                            {product.is_active ? 'نشط' : 'موقوف'}
                          </Badge>
                          {product.is_featured ? <Badge variant="gold">مميز</Badge> : null}
                          {product.is_new ? <Badge variant="outline">جديد</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-mocha">{formatUpdatedAt(product.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/admin/products/${product.id}/edit`}>تعديل</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === product.id}
                            onClick={() => void patchFlag(product, 'is_active', !product.is_active)}
                          >
                            {product.is_active ? 'إيقاف' : 'تفعيل'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === product.id}
                            onClick={() =>
                              void patchFlag(product, 'is_featured', !product.is_featured)
                            }
                          >
                            {product.is_featured ? 'إلغاء التمييز' : 'تمييز'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyId === product.id}
                            onClick={() => void patchFlag(product, 'is_new', !product.is_new)}
                          >
                            {product.is_new ? 'إلغاء جديد' : 'جديد'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            disabled={busyId === product.id}
                            onClick={() => void handleDelete(product)}
                          >
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
