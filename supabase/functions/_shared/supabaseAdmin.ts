import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_MISSING')
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function storefrontBaseUrl(): string {
  const fromEnv = (Deno.env.get('STOREFRONT_URL') ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return 'https://athar.qd.je'
}
