import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/admin/AuthProvider'
import { getErrorMessage } from '@/lib/errors'
import { toast } from 'sonner'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { configured, loading, session, isAdmin, signIn } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const redirectTo =
    typeof location.state === 'object' &&
    location.state &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : '/admin'

  if (!loading && configured && session && isAdmin) {
    return <Navigate to={redirectTo} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('تم تسجيل الدخول')
      navigate(redirectTo, { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, 'فشل تسجيل الدخول'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="دخول الإدارة" />
      <div className="flex min-h-dvh items-center justify-center bg-mist px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-taupe/40 bg-card p-8 shadow-soft">
          <div className="mb-8 text-center">
            <BrandLogo imgClassName="mx-auto h-16 w-16" />
            <h1 className="mt-4 font-display text-2xl font-semibold">أثر</h1>
            <p className="mt-1 text-sm text-mocha">دخول لوحة الإدارة</p>
          </div>

          {!configured ? (
            <p className="rounded-md bg-mist px-4 py-3 text-sm leading-7 text-mocha">
              أضيفي بيانات مشروع Supabase <strong>athar</strong> في ملف{' '}
              <code className="text-brown">.env</code> ثم أعيدي تشغيل التطبيق.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  className="text-start"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || loading}>
                {submitting ? 'جاري الدخول...' : 'دخول'}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-mocha">
            <Link to="/" className="hover:text-brown">
              العودة للمتجر
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
