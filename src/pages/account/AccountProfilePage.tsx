import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '@/components/seo/PageMeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/admin/AuthProvider'
import { saveCustomerProfile } from '@/services/customerService'
import { toast } from 'sonner'

export function AccountProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultAddress, setDefaultAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Seed from profile once loaded
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setPhone(profile.phone ?? '')
      setDefaultAddress(profile.default_address ?? '')
    } else if (user) {
      const name = user.user_metadata?.full_name as string | undefined
      if (name) setFullName(name)
    }
  }, [profile, user])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveCustomerProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
        default_address: defaultAddress.trim(),
      })
      await refreshProfile()
      setMessage('تم حفظ الملف الشخصي بنجاح.')
      toast.success('تم حفظ الملف الشخصي.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر الحفظ. حاولي مرة أخرى.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container-athar py-10 sm:py-14" dir="rtl">
      <PageMeta title="إعدادات الحساب — أثر" path="/account/profile" noIndex />

      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/account">← حسابي</Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold">إعدادات الحساب</h1>
      </div>

      <div className="mx-auto max-w-lg rounded-2xl border border-taupe/30 bg-card p-6 sm:p-8">
        {/* Email (read-only) */}
        <div className="mb-6 space-y-1">
          <p className="text-xs text-mocha">البريد الإلكتروني</p>
          <p className="font-medium text-brown" dir="ltr">{user?.email}</p>
          <p className="text-xs text-mocha">لا يمكن تغيير البريد الإلكتروني من هنا.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">الاسم بالكامل</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              disabled={saving}
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">رقم الهاتف</Label>
            <Input
              id="profile-phone"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              disabled={saving}
              autoComplete="tel"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-address">العنوان الافتراضي</Label>
            <Textarea
              id="profile-address"
              value={defaultAddress}
              onChange={(e) => setDefaultAddress(e.target.value)}
              maxLength={300}
              disabled={saving}
              placeholder="المحافظة، المدينة، الشارع…"
              className="min-h-[5rem]"
              autoComplete="street-address"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">{error}</p>
          )}
          {message && (
            <p role="status" className="rounded-lg bg-mist p-3 text-sm">{message}</p>
          )}

          <Button className="w-full" disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </Button>
        </form>
      </div>
    </div>
  )
}
