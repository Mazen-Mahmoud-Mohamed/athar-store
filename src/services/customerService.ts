import { requireSupabase } from '@/lib/supabase'
import { toAppError } from '@/lib/errors'
import type { Order } from '@/types'
import { adminGetOrderById } from '@/services/orderService'

// These queries use the customer's JWT. Database RLS is the authorization boundary.
export async function listCustomerOrders(): Promise<Order[]> {
  const client = requireSupabase()
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) throw new Error('سجّلي الدخول لمتابعة طلباتك.')
  const { data, error } = await client.from('orders').select('*').eq('customer_id', user.id)
    .order('created_at', { ascending: false }).limit(100)
  if (error) throw toAppError(error, 'تعذر تحميل الطلبات.')
  return data ?? []
}

export async function getCustomerOrder(id: string) {
  const client = requireSupabase()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('سجّلي الدخول لمتابعة طلباتك.')
  // Ownership also explicitly filters admin accounts using the customer dashboard.
  const { data, error } = await client.from('orders').select('id').eq('id', id).eq('customer_id', user.id).maybeSingle()
  if (error) throw error
  return data ? adminGetOrderById(id) : null
}

export async function cancelCustomerOrder(id: string) {
  const { error } = await requireSupabase().rpc('customer_cancel_order', { p_order_id: id })
  if (error) throw new Error(/ORDER_NOT_CANCELLABLE/.test(error.message)
    ? 'لم يعد الطلب مؤهلاً للإلغاء. تواصلي معنا للمساعدة.' : 'تعذر تنفيذ الطلب. حدّثي الصفحة وحاولي مرة أخرى.')
}

export async function saveCustomerProfile(values: { full_name: string; phone: string; default_address: string }) {
  const client = requireSupabase()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('سجّلي الدخول أولاً.')
  const { error } = await client.from('profiles').update(values).eq('id', user.id)
  if (error) throw toAppError(error, 'تعذر حفظ الملف الشخصي.')
}
