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
  const { configured, loading, session, isAdmin, signIn, signOut } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const redirectTo =
    typeof location.state === 'object' &&
    location.state &&
    'from' in location.state &&
    typeof (location.state as { from?: unknown }).from === 'string'
      ? (location.state as { from: string }).from
      : '/admin'

  if (loading) {
    return (
      <>
        <PageMeta title="دخول الإدارة" path="/admin/login" noIndex />
        <div className="flex min-h-dvh items-center justify-center bg-mist px-4 text-sm text-mocha">
          جاري التحقق من الجلسة...
        </div>
      </>
    )
  }

  if (configured && session && isAdmin) {
    return <Navigate to={redirectTo} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    setAuthError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('تم تسجيل الدخول')
      navigate(redirectTo, { replace: true })
    } catch (error) {
      const message = getErrorMessage(error, 'فشل تسجيل الدخول')
      setAuthError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta
        title="دخول الإدارة"
        description="دخول لوحة إدارة متجر أثر."
        path="/admin/login"
        noIndex
      />
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
              <code className="text-brown">.env.local</code> ثم أعيدي تشغيل التطبيق.
            </p>
          ) : (
            <>
              {session && !isAdmin ? (
                <div
                  className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-7 text-danger"
                  role="alert"
                >
                  <p>هذا الحساب مسجّل الدخول لكنه لا يملك صلاحية الإدارة.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void signOut()}
                  >
                    تسجيل الخروج والمحاولة بحساب آخر
                  </Button>
                </div>
              ) : null}

              {authError ? (
                <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
                  {authError}
                </p>
              ) : null}

              <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
                    disabled={submitting}
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
                    disabled={submitting}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting || loading}>
                  {submitting ? 'جاري الدخول...' : 'دخول'}
                </Button>
              </form>
            </>
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
