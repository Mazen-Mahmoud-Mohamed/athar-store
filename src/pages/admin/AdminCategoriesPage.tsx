import { useEffect, useState, type FormEvent } from 'react'
import { PageMeta } from '@/components/seo/PageMeta'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/errors'
import { slugifyArabic } from '@/lib/utils'
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminGetAllCategories,
  adminReplaceCategoryImage,
  adminToggleCategoryActive,
  adminUpdateCategory,
} from '@/services/categoryService'
import type { Category } from '@/types'
import { toast } from 'sonner'

type FormState = {
  name: string
  slug: string
  description: string
  sort_order: string
  is_active: boolean
}

const emptyForm: FormState = {
  name: '',
  slug: '',
  description: '',
  sort_order: '0',
  is_active: true,
}

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [slugManual, setSlugManual] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    const data = await adminGetAllCategories()
    setCategories(data)
    setError(null)
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        await reload()
      } catch (err) {
        if (!active) return
        setError(getErrorMessage(err, 'تعذر تحميل التصنيفات'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setSlugManual(false)
    setImageFile(null)
    setImagePreview(null)
    setOpen(true)
  }

  function openEdit(category: Category) {
    setEditing(category)
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      sort_order: String(category.sort_order),
      is_active: category.is_active,
    })
    setSlugManual(true)
    setImageFile(null)
    setImagePreview(category.image_url)
    setOpen(true)
  }

  function onNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: slugManual ? prev.slug : slugifyArabic(name),
    }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
      }

      const saved = editing
        ? await adminUpdateCategory(editing.id, payload)
        : await adminCreateCategory(payload)

      if (imageFile) {
        await adminReplaceCategoryImage(saved.id, imageFile, saved.image_url)
      }

      toast.success(editing ? 'تم تحديث التصنيف' : 'تم إنشاء التصنيف')
      setOpen(false)
      setEditing(null)
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر حفظ التصنيف'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(category: Category) {
    setBusyId(category.id)
    try {
      await adminToggleCategoryActive(category.id, !category.is_active)
      await reload()
      toast.success(category.is_active ? 'تم إيقاف التصنيف' : 'تم تفعيل التصنيف')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر تحديث الحالة'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(category: Category) {
    if (!window.confirm(`هل تريدين حذف التصنيف «${category.name}»؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return
    }

    setBusyId(category.id)
    try {
      await adminDeleteCategory(category.id)
      toast.success('تم حذف التصنيف')
      await reload()
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر حذف التصنيف'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageMeta title="إدارة التصنيفات" path="/admin/categories" noIndex />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">التصنيفات</h1>
            <p className="mt-2 text-sm text-mocha">تنظيم مجموعات أثر — مرتبطة مباشرة بقاعدة البيانات</p>
          </div>
          <Button type="button" onClick={openCreate}>
            تصنيف جديد
          </Button>
        </div>

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-mocha">جاري التحميل...</p>
        ) : categories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-taupe/50 bg-card px-6 py-16 text-center">
            <p className="font-display text-lg text-brown">لا توجد تصنيفات بعد</p>
            <p className="mt-2 text-sm text-mocha">ابدئي بإضافة أول مجموعة لمتجر أثر.</p>
            <Button type="button" className="mt-6" onClick={openCreate}>
              إضافة تصنيف
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <article
                key={category.id}
                className="flex flex-col overflow-hidden rounded-xl border border-taupe/40 bg-card"
              >
                <div className="aspect-[16/9] bg-mist">
                  {category.image_url ? (
                    <img
                      src={category.image_url}
                      alt={category.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-3xl text-brown/15">
                      أثر
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">{category.name}</h2>
                      <p className="mt-1 text-xs text-mocha/80" dir="ltr">
                        /{category.slug}
                      </p>
                    </div>
                    <Badge variant={category.is_active ? 'soft' : 'danger'}>
                      {category.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </div>
                  {category.description ? (
                    <p className="line-clamp-2 text-sm leading-7 text-mocha">{category.description}</p>
                  ) : null}
                  <p className="text-xs text-mocha/70">الترتيب: {category.sort_order}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === category.id}
                      onClick={() => openEdit(category)}
                    >
                      تعديل
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === category.id}
                      onClick={() => void handleToggle(category)}
                    >
                      {category.is_active ? 'إيقاف' : 'تفعيل'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      disabled={busyId === category.id}
                      onClick={() => void handleDelete(category)}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل تصنيف' : 'تصنيف جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">الاسم</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-slug">المعرّف (Slug)</Label>
              <Input
                id="cat-slug"
                dir="ltr"
                className="text-start"
                value={form.slug}
                onChange={(e) => {
                  setSlugManual(true)
                  setForm((prev) => ({ ...prev, slug: e.target.value }))
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-description">الوصف</Label>
              <textarea
                id="cat-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="flex w-full rounded-md border border-taupe/50 bg-card px-3 py-2 text-sm text-brown focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-sort">الترتيب</Label>
              <Input
                id="cat-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              نشط (يظهر في المتجر)
            </label>
            <div className="space-y-2">
              <Label htmlFor="cat-image">صورة التصنيف (اختياري)</Label>
              <Input
                id="cat-image"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setImageFile(file)
                  if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
                  setImagePreview(file ? URL.createObjectURL(file) : editing?.image_url ?? null)
                }}
              />
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="معاينة التصنيف"
                  className="mt-2 h-28 w-full rounded-md object-cover"
                />
              ) : null}
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
