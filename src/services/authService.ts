import { isSupabaseConfigured, requireSupabase, supabase } from '@/lib/supabase'
import { AppError, toAppError } from '@/lib/errors'
import type { Profile } from '@/types'
import type { Session, User } from '@supabase/supabase-js'

export async function signInWithPassword(email: string, password: string) {
  if (!isSupabaseConfigured) {
    throw new AppError('not_configured', 'Supabase غير مهيأ. أضيفي VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY.')
  }

  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw toAppError(error, 'فشل تسجيل الدخول')
  return data
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw toAppError(error, 'فشل تسجيل الخروج')
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw toAppError(error, 'تعذر قراءة الجلسة')
  return data.session
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw toAppError(error, 'تعذر قراءة المستخدم')
  return data.user
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabase) return null

  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw toAppError(error, 'تعذر قراءة الملف الشخصي')
  return data
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!supabase) return false

  try {
    const { data, error } = await supabase.rpc('is_admin')
    if (!error) return Boolean(data)
  } catch {
    // Fall through to profile check
  }

  try {
    const profile = await getCurrentProfile()
    return profile?.role === 'admin'
  } catch {
    return false
  }
}

export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void,
) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe() {} } } }
  }
  return supabase.auth.onAuthStateChange(callback)
}
