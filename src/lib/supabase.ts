import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from '../types/database.generated'

export const supabase = env.demoMode
  ? null
  : createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is unavailable while demo mode is enabled.')
  return supabase
}
