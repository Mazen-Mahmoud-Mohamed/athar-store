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
  adminUpdateCategory,
} from '@/services/categoryService'
import type { Category } from '@/types'
import { toast } from 'sonner'

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [saving, setSaving] = useState(false)

  async function reload() {
    const data = await adminGetAllCategories()
    setCategories(data)
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        await reload()
      } catch (error) {
        toast.error(getErrorMessage(error, 'تعذر تحميل التصنيفات'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const slug = String(form.get('slug') ?? '').trim() || slugifyArabic(name)
    const description = String(form.get('description') ?? '').trim()
    const sortOrder = Number(form.get('sort_order') || 0)

    setSaving(true)
    try {
      const payload = {
        name,
        slug,
        description: description || null,
        sort_order: sortOrder,
        is_active: form.get('is_active') === 'on',
      }

      if (editing) {
        await adminUpdateCategory(editing.id, payload)
        toast.success('تم تحديث التصنيف')
      } else {
        await adminCreateCategory(payload)
        toast.success('تم إنشاء التصنيف')
      }

      setOpen(false)
      setEditing(null)
      await reload()
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر حفظ التصنيف'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(category: Category) {
    if (!window.confirm(`حذف التصنيف "${category.name}"؟`)) return
    try {
      await adminDeleteCategory(category.id)
      toast.success('تم حذف التصنيف')
      await reload()
    } catch (error) {
      toast.error(getErrorMessage(error, 'تعذر حذف التصنيف'))
    }
  }

  return (
    <>
      <PageMeta title="إدارة التصنيفات" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">التصنيفات</h1>
            <p className="mt-2 text-sm text-mocha">تنظيم مجموعات أثر</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            تصنيف جديد
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-mocha">جاري التحميل...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((category) => (
              <article key={category.id} className="rounded-xl border border-taupe/40 bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{category.name}</h2>
                    <p className="mt-1 text-sm text-mocha">{category.description}</p>
                    <p className="mt-2 text-xs text-mocha/70">/{category.slug}</p>
                  </div>
                  <Badge variant={category.is_active ? 'soft' : 'danger'}>
                    {category.is_active ? 'نشط' : 'موقوف'}
                  </Badge>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(category)
                      setOpen(true)
                    }}
                  >
                    تعديل
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDelete(category)}
                  >
                    حذف
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل تصنيف' : 'تصنيف جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input id="name" name="name" required defaultValue={editing?.name ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                dir="ltr"
                className="text-start"
                defaultValue={editing?.slug ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Input id="description" name="description" defaultValue={editing?.description ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">الترتيب</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                defaultValue={editing?.sort_order ?? 0}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} />
              نشط
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
