import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/errors'
import { slugifyArabic } from '@/lib/utils'
import {
  adminCreateProduct,
  adminGetProductById,
  adminUpdateProduct,
  uploadProductImage,
} from '@/services/productService'
import { adminGetAllCategories } from '@/services/categoryService'
import type { Category, Product } from '@/types'
import { toast } from 'sonner'

export function AdminProductFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

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
          setProduct(found)
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
  }, [id])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const slugInput = String(form.get('slug') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const price = Number(form.get('price'))
    const oldPriceRaw = String(form.get('old_price') ?? '').trim()
    const stockQuantity = Number(form.get('stock_quantity') || 0)
    const categoryId = String(form.get('category_id') ?? '') || null
    const imageFile = (form.get('image') as File | null) ?? null

    setSaving(true)
    try {
      const payload = {
        name,
        slug: slugInput || slugifyArabic(name),
        description: description || null,
        price,
        old_price: oldPriceRaw ? Number(oldPriceRaw) : null,
        stock_quantity: stockQuantity,
        category_id: categoryId,
        is_active: form.get('is_active') === 'on',
        is_featured: form.get('is_featured') === 'on',
        is_new: form.get('is_new') === 'on',
      }

      const saved = isEdit && id
        ? await adminUpdateProduct(id, payload)
        : await adminCreateProduct(payload)

      if (imageFile && imageFile.size > 0) {
        const imageUrl = await uploadProductImage(imageFile, saved.id)
        await adminUpdateProduct(saved.id, { image_url: imageUrl })
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

  return (
    <>
      <PageMeta title={isEdit ? 'تعديل منتج' : 'إضافة منتج'} />
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {isEdit ? 'تعديل منتج' : 'إضافة منتج'}
          </h1>
          <p className="mt-2 text-sm text-mocha">الحفظ يتم مباشرة عبر Supabase مع حماية RLS.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-taupe/40 bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="name">اسم المنتج</Label>
            <Input id="name" name="name" defaultValue={product?.name ?? ''} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={product?.slug ?? ''}
              dir="ltr"
              className="text-start"
              placeholder="optional-auto-from-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_id">التصنيف</Label>
            <select
              id="category_id"
              name="category_id"
              defaultValue={product?.category_id ?? ''}
              className="flex h-11 w-full rounded-md border border-taupe/50 bg-card px-3 text-sm"
            >
              <option value="">بدون تصنيف</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">السعر</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={product?.price ?? ''}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="old_price">السعر السابق</Label>
              <Input
                id="old_price"
                name="old_price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={product?.old_price ?? ''}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock_quantity">المخزون</Label>
            <Input
              id="stock_quantity"
              name="stock_quantity"
              type="number"
              min="0"
              defaultValue={product?.stock_quantity ?? 0}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">الوصف</Label>
            <Input id="description" name="description" defaultValue={product?.description ?? ''} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} />
              نشط
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="is_featured" defaultChecked={product?.is_featured ?? false} />
              مميز
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="is_new" defaultChecked={product?.is_new ?? false} />
              جديد
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">صورة المنتج</Label>
            <Input id="image" name="image" type="file" accept=".jpg,.jpeg,.png,.webp,image/*" />
            {product?.image_url ? (
              <p className="text-xs text-mocha break-all">الحالية: {product.image_url}</p>
            ) : null}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء المنتج'}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/admin/products">إلغاء</Link>
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
