import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const defaultUrl = 'https://jjaunlbglskpddslwegp.supabase.co'
const defaultPublishableKey = 'sb_publishable_AKvYjBjCJIyCOwJ1M1ooqQ_dFkmSmml'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || defaultUrl
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || defaultPublishableKey

// The publishable key is intentionally safe to ship in browser code.
// Authorization is enforced by PostgreSQL Row Level Security.
export const hasSupabaseConfig = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
