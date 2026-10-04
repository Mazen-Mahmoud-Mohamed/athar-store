import { useEffect, useState, type FormEvent } from 'react'
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminImageUpload } from '@/components/admin/AdminImageUpload'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
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
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

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
        slug: form.slug.trim() || slugifyArabic(form.name),
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

      toast.success(editing ? 'تم حفظ التصنيف' : 'تم إضافة التصنيف')
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
      toast.success(category.is_active ? 'تم إخفاء التصنيف' : 'التصنيف متاح الآن')
    } catch (err) {
      toast.error(getErrorMessage(err, 'تعذر تحديث الحالة'))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await adminDeleteCategory(deleteTarget.id)
      toast.success('تم حذف التصنيف')
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          'لا يمكن حذف هذا التصنيف لأنه يحتوي على منتجات. قم بنقل المنتجات إلى تصنيف آخر أولًا.',
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageMeta title="إدارة التصنيفات" path="/admin/categories" noIndex />
      <div className="space-y-6">
        <AdminPageHeader
          title="التصنيفات"
          description="نظّمي مجموعات المنتجات في متجرك"
          actions={
            <Button type="button" onClick={openCreate}>
              + إضافة تصنيف
            </Button>
          }
        />

        {error ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-mocha" aria-live="polite">
            جارٍ تحميل التصنيفات...
          </p>
        ) : categories.length === 0 ? (
          <AdminEmptyState
            title="لا توجد تصنيفات حاليًا"
            description="أضيفي أول تصنيف لتنظيم منتجاتك."
            action={
              <Button type="button" onClick={openCreate}>
                + إضافة تصنيف
              </Button>
            }
          />
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
                    <h2 className="font-display text-lg font-semibold">{category.name}</h2>
                    <Badge variant={category.is_active ? 'soft' : 'danger'}>
                      {category.is_active ? 'متاح' : 'غير متاح'}
                    </Badge>
                  </div>
                  {category.description ? (
                    <p className="line-clamp-2 text-sm leading-7 text-mocha">{category.description}</p>
                  ) : null}
                  <p className="text-xs text-mocha/70">ترتيب الظهور: {category.sort_order}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
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
                      {category.is_active ? 'إخفاء' : 'إظهار'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      className="ms-auto"
                      disabled={busyId === category.id}
                      onClick={() => setDeleteTarget(category)}
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

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="حذف التصنيف؟"
        description={`هل أنت متأكد من حذف «${deleteTarget?.name ?? ''}»؟ إذا كان يحتوي على منتجات فلن يتم الحذف.`}
        confirmLabel="حذف التصنيف"
        destructive
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={() => void confirmDelete()}
      />

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
              <Label htmlFor="cat-sort">ترتيب الظهور</Label>
              <Input
                id="cat-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
              />
              <p className="text-xs text-mocha">الأرقام الأصغر تظهر أولاً.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              التصنيف متاح في المتجر
            </label>
            <AdminImageUpload
              label="صورة التصنيف (اختياري)"
              helperText="اختيارية — تساعد العميلة على تمييز التصنيف."
              previewUrl={imagePreview}
              fileName={imageFile?.name ?? null}
              previewClassName="h-28 w-full"
              onFileChange={(file) => {
                setImageFile(file)
                if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
                setImagePreview(file ? URL.createObjectURL(file) : editing?.image_url ?? null)
              }}
            />
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'جارٍ الحفظ...' : 'حفظ التصنيف'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
