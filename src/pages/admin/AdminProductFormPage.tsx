import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/errors'
import { calcDiscountPercent, formatPrice, slugifyArabic } from '@/lib/utils'
import { adminGetAllCategories } from '@/services/categoryService'
import {
  adminCreateProduct,
  adminGetProductById,
  adminReplaceProductImage,
  adminUpdateProduct,
} from '@/services/productService'
import type { Category, Product } from '@/types'
import { toast } from 'sonner'

type FormState = {
  name: string
  slug: string
  description: string
  category_id: string
  price: string
  old_price: string
  stock_quantity: string
  is_active: boolean
  is_featured: boolean
  is_new: boolean
}

const emptyForm: FormState = {
  name: '',
  slug: '',
  description: '',
  category_id: '',
  price: '',
  old_price: '',
  stock_quantity: '0',
  is_active: true,
  is_featured: false,
  is_new: false,
}

export function AdminProductFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [slugManual, setSlugManual] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const cats = await adminGetAllCategories()
        if (!active) return
        setCategories(cats)

        if (id) {
          const found = await adminGetProductById(id)
          if (!active) return
          if (!found) {
            toast.error('المنتج غير موجود')
            navigate('/admin/products', { replace: true })
            return
          }
          setProduct(found)
          setForm({
            name: found.name,
            slug: found.slug,
            description: found.description ?? '',
            category_id: found.category_id ?? '',
            price: String(found.price),
            old_price: found.old_price != null ? String(found.old_price) : '',
            stock_quantity: String(found.stock_quantity),
            is_active: found.is_active,
            is_featured: found.is_featured,
            is_new: found.is_new,
          })
          setSlugManual(true)
          setImagePreview(found.image_url)
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'تعذر تحميل النموذج'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id, navigate])

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  function onNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: slugManual ? prev.slug : slugifyArabic(name),
    }))
  }

  function validateClient(): string | null {
    if (!form.name.trim()) return 'اسم المنتج مطلوب.'
    if (!form.slug.trim()) return 'المعرّف (Slug) مطلوب.'
    if (form.price === '' || Number.isNaN(Number(form.price))) return 'السعر مطلوب ويجب أن يكون رقماً.'
    if (Number(form.price) < 0) return 'السعر لا يمكن أن يكون سالباً.'
    if (form.old_price !== '') {
      const oldPrice = Number(form.old_price)
      if (Number.isNaN(oldPrice) || oldPrice < 0) return 'السعر السابق غير صالح.'
      if (oldPrice < Number(form.price)) {
        return 'السعر السابق يجب أن يكون أكبر من أو يساوي السعر الحالي.'
      }
    }
    const stock = Number(form.stock_quantity)
    if (!Number.isInteger(stock) || stock < 0) {
      return 'كمية المخزون يجب أن تكون عدداً صحيحاً غير سالب.'
    }
    return null
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const clientError = validateClient()
    if (clientError) {
      setFieldError(clientError)
      return
    }

    setFieldError(null)
    setSaving(true)

    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        category_id: form.category_id || null,
        price: form.price,
        old_price: form.old_price === '' ? null : form.old_price,
        stock_quantity: form.stock_quantity,
        is_active: form.is_active,
        is_featured: form.is_featured,
        is_new: form.is_new,
      }

      const saved =
        isEdit && id ? await adminUpdateProduct(id, payload) : await adminCreateProduct(payload)

      if (imageFile) {
        await adminReplaceProductImage(saved.id, imageFile, saved.image_url)
      }

      toast.success(isEdit ? 'تم حفظ التعديلات' : 'تم إنشاء المنتج')
      navigate('/admin/products')
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر حفظ المنتج'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-mocha">جاري التحميل...</p>
  }

  const previewPrice = Number(form.price)
  const previewOld = form.old_price === '' ? null : Number(form.old_price)
  const discount =
    Number.isFinite(previewPrice) && previewOld != null
      ? calcDiscountPercent(previewPrice, previewOld)
      : null

  return (
    <>
      <PageMeta title={isEdit ? 'تعديل منتج' : 'إضافة منتج'} />
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {isEdit ? 'تعديل منتج' : 'إضافة منتج'}
          </h1>
          <p className="mt-2 text-sm text-mocha">
            نموذج واحد للإنشاء والتعديل — الحفظ مباشرة عبر Supabase مع حماية RLS.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-taupe/40 bg-card p-6">
          {fieldError ? (
            <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {fieldError}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">اسم المنتج</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => onNameChange(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">المعرّف (Slug)</Label>
            <Input
              id="slug"
              dir="ltr"
              className="text-start"
              value={form.slug}
              onChange={(e) => {
                setSlugManual(true)
                setForm((prev) => ({ ...prev, slug: e.target.value }))
              }}
              required
            />
            <p className="text-xs text-mocha/70">
              يُنشأ تلقائياً من الاسم ويمكن تعديله يدوياً دون أن يُستبدل لاحقاً.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">الوصف</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={4}
              className="flex w-full rounded-md border border-taupe/50 bg-card px-3 py-2 text-sm text-brown focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">التصنيف</Label>
            <select
              id="category_id"
              value={form.category_id}
              onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
              className="flex h-11 w-full rounded-md border border-taupe/50 bg-card px-3 text-sm"
            >
              <option value="">بدون تصنيف</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {!category.is_active ? ' (موقوف)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">السعر (ج.م)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="old_price">السعر السابق (اختياري)</Label>
              <Input
                id="old_price"
                type="number"
                min="0"
                step="0.01"
                value={form.old_price}
                onChange={(e) => setForm((prev) => ({ ...prev, old_price: e.target.value }))}
              />
            </div>
          </div>

          {Number.isFinite(previewPrice) && previewPrice >= 0 ? (
            <p className="text-sm text-mocha">
              المعاينة: {formatPrice(previewPrice)}
              {previewOld != null && Number.isFinite(previewOld) ? (
                <>
                  {' '}
                  <span className="line-through opacity-70">{formatPrice(previewOld)}</span>
                </>
              ) : null}
              {discount ? <span className="ms-2 text-gold-deep">خصم {discount}%</span> : null}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="stock_quantity">كمية المخزون</Label>
            <Input
              id="stock_quantity"
              type="number"
              min="0"
              step="1"
              value={form.stock_quantity}
              onChange={(e) => setForm((prev) => ({ ...prev, stock_quantity: e.target.value }))}
            />
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              نشط (يظهر في المتجر)
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_featured}
                onChange={(e) => setForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
              />
              مميز
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_new}
                onChange={(e) => setForm((prev) => ({ ...prev, is_new: e.target.checked }))}
              />
              جديد
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">صورة المنتج</Label>
            <Input
              id="image"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setImageFile(file)
                if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
                setImagePreview(file ? URL.createObjectURL(file) : product?.image_url ?? null)
              }}
            />
            <p className="text-xs text-mocha/70">JPG أو PNG أو WEBP — بحد أقصى 5 ميجابايت.</p>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="معاينة المنتج"
                className="mt-2 aspect-[4/5] max-h-64 w-auto rounded-md object-cover"
              />
            ) : (
              <div className="mt-2 flex aspect-[4/5] max-h-48 w-40 items-center justify-center rounded-md bg-mist text-xs text-mocha">
                بلا صورة
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء المنتج'}
            </Button>
            <Button asChild type="button" variant="outline" disabled={saving}>
              <Link to="/admin/products">إلغاء</Link>
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
