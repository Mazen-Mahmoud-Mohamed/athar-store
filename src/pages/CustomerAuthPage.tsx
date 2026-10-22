import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageMeta } from '@/components/seo/PageMeta'
import { useAuth } from '@/features/admin/AuthProvider'
import { authReturnUrl, customerReturnPath } from '@/features/account/navigation'
import { requireSupabase } from '@/lib/supabase'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'callback'
const titles: Record<Mode,string> = { login:'أهلاً بعودتكِ', register:'حسابكِ في أثر', forgot:'نسيتِ كلمة المرور؟', reset:'كلمة مرور جديدة', callback:'جارٍ تسجيل الدخول' }

export function CustomerAuthPage({ mode }: { mode: Mode }) {
  const { user, loading, signIn, configured } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = customerReturnPath(params.get('next'))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const callbackError = params.has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error')

  useEffect(() => {
    if (loading || callbackError) return
    // PKCE code exchange is performed once by detectSessionInUrl during SDK initialization.
    if (user?.email_confirmed_at && (mode === 'callback' || mode === 'login' || mode === 'register')) {
      navigate(next, { replace: true })
    }
  }, [loading, user, mode, next, navigate, callbackError])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    setBusy(true); setError(''); setMessage('')
    try {
      const client = requireSupabase()
      if (mode === 'login') {
        await signIn(email, password)
      } else if (mode === 'register') {
        const { data, error: failure } = await client.auth.signUp({ email, password, options: {
          emailRedirectTo: authReturnUrl(next), data: { full_name: String(form.get('name') ?? '').trim() },
        } })
        if (failure) throw failure
        if (data.session && data.user?.email_confirmed_at) navigate(next, { replace: true })
        else setMessage('راجعي بريدك الإلكتروني لتأكيد حسابك، ثم عودي لإكمال طلبك من نفس المتصفح. منتجاتك محفوظة.')
      } else if (mode === 'forgot') {
        const { error: failure } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
        })
        if (failure) throw failure
        setMessage('إذا كان البريد مسجلاً، ستصلكِ رسالة لاستعادة كلمة المرور. افتحي الرابط من نفس المتصفح.')
      } else if (mode === 'reset') {
        if (!user) throw new Error('انتهت صلاحية الرابط. اطلبي رسالة جديدة.')
        const { error: failure } = await client.auth.updateUser({ password })
        if (failure) throw failure
        setMessage('تم تحديث كلمة المرور بنجاح.')
      }
    } catch {
      setError(mode === 'login' ? 'تعذر الدخول. تحققي من البريد وكلمة المرور وتأكيد بريدك الإلكتروني.'
        : 'تعذر إتمام العملية. تحققي من البيانات أو اطلبي رابطاً جديداً وحاولي مرة أخرى.')
    } finally { setBusy(false) }
  }

  async function google() {
    setBusy(true); setError('')
    try {
      const { error: failure } = await requireSupabase().auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: authReturnUrl(next), scopes: 'openid email profile',
      } })
      if (failure) throw failure
    } catch { setError('تعذر الاتصال بـ Google. حاولي مرة أخرى أو استخدمي البريد الإلكتروني.'); setBusy(false) }
  }

  async function resend() {
    const email = (document.getElementById('customer-email') as HTMLInputElement | null)?.value.trim()
    if (!email || busy) return
    setBusy(true); setError('')
    try {
      const { error: failure } = await requireSupabase().auth.resend({ type:'signup', email, options:{ emailRedirectTo:authReturnUrl(next) } })
      if (failure) throw failure
      setMessage('إذا كان الحساب ينتظر التأكيد، ستصلكِ رسالة جديدة.')
    } catch { setError('تعذر إرسال الرسالة الآن. حاولي بعد قليل.') }
    finally { setBusy(false) }
  }

  const query = `?next=${encodeURIComponent(next)}`
  return <div className="container-athar py-12 sm:py-20" dir="rtl">
    <PageMeta title={titles[mode]} path={mode === 'callback' ? '/auth/callback' : `/${mode}`} noIndex />
    <section className="mx-auto max-w-md rounded-2xl border border-taupe/30 bg-card p-6 shadow-soft sm:p-9">
      <p className="text-xs tracking-widest text-gold-deep">أثر — أناقة تترك أثراً</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">{titles[mode]}</h1>
      <p className="mt-3 text-sm leading-7 text-mocha">حسابك مطلوب لإتمام الشراء ومتابعة طلباتك. السلة واختيار الشراء المباشر محفوظان.</p>
      {(error || callbackError) && <p role="alert" className="mt-5 rounded-lg bg-danger/5 p-3 text-sm text-danger">{error || 'لم يكتمل تسجيل الدخول. يمكنكِ المحاولة مرة أخرى، ومنتجاتك محفوظة.'}</p>}
      {message && <p role="status" className="mt-5 rounded-lg bg-mist p-3 text-sm leading-7">{message}</p>}
      {mode === 'callback' ? <div className="mt-6 text-sm" role="status">{loading ? 'جارٍ التحقق من الجلسة…' : !user || callbackError ? <Link to={`/login${query}`} className="underline">العودة لتسجيل الدخول</Link> : 'جارٍ المتابعة…'}</div> : <>
        {(mode === 'login' || mode === 'register') && <>
          <Button type="button" variant="outline" className="mt-6 w-full gap-3" disabled={busy || !configured} onClick={() => void google()}>
            <span aria-hidden="true" className="font-sans text-lg font-bold">G</span>{busy ? 'يرجى الانتظار…' : 'المتابعة باستخدام Google'}
          </Button>
          <p className="my-5 text-center text-xs text-mocha">أو باستخدام البريد الإلكتروني</p>
        </>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'register' && <div className="space-y-2"><Label htmlFor="customer-name">الاسم بالكامل</Label><Input id="customer-name" name="name" autoComplete="name" minLength={2} maxLength={100} required /></div>}
          {mode !== 'reset' && <div className="space-y-2"><Label htmlFor="customer-email">البريد الإلكتروني</Label><Input id="customer-email" name="email" type="email" dir="ltr" autoComplete="email" required /></div>}
          {mode !== 'forgot' && <div className="space-y-2"><Label htmlFor="customer-password">كلمة المرور</Label><Input id="customer-password" name="password" type="password" dir="ltr" minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></div>}
          <Button className="w-full" disabled={busy || !configured || (mode === 'reset' && (loading || !user))}>{busy ? 'يرجى الانتظار…' : mode === 'login' ? 'تسجيل الدخول' : mode === 'register' ? 'إنشاء حساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور'}</Button>
        </form>
        {mode === 'login' && <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm"><Link to={`/register${query}`} className="underline">إنشاء حساب جديد</Link><Link to="/forgot-password" className="underline">نسيتِ كلمة المرور؟</Link><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void resend()}>إعادة إرسال رسالة التأكيد</Button></div>}
        {mode !== 'login' && <Link to={`/login${query}`} className="mt-5 block text-sm underline">العودة لتسجيل الدخول</Link>}
      </>}
    </section>
  </div>
}
