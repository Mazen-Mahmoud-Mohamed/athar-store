import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const PLACEHOLDER_PATTERN =
  /your-project|your-athar|your-anon|your-.*-key|placeholder|changeme|<.*>|example\.com|xxx+/i

function looksLikePlaceholder(value: string) {
  const trimmed = value.trim()
  return trimmed.length === 0 || PLACEHOLDER_PATTERN.test(trimmed)
}

function isValidSupabaseUrl(url: string) {
  if (looksLikePlaceholder(url)) return false

  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)
    )
  } catch {
    return false
  }
}

function isValidAnonKey(key: string) {
  if (looksLikePlaceholder(key)) return false

  // Support legacy JWT anon keys and newer publishable keys.
  if (key.startsWith('sb_publishable_') && key.length >= 20) return true
  if (key.startsWith('eyJ') && key.length >= 40) return true

  return false
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    isValidSupabaseUrl(supabaseUrl) &&
    isValidAnonKey(supabaseAnonKey),
)

/**
 * Browser-only Supabase client using the public anon key.
 * Never import or expose the service_role key in the frontend.
 * Authorization must be enforced with RLS policies.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the athar project.',
    )
  }
  return supabase
}
