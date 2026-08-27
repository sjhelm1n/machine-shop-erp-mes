const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!demoMode && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or set VITE_DEMO_MODE=true.',
  )
}

export const env = {
  demoMode,
  supabaseUrl: supabaseUrl ?? '',
  supabasePublishableKey: supabasePublishableKey ?? '',
}
