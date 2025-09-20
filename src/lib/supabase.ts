import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 1000, // Increased from 50 to handle 500+ concurrent users
    },
    timeout: 45000, // 45 second timeout for high-load stability
    heartbeatIntervalMs: 15000, // 15 second heartbeat for better connection maintenance
  },
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true, // Enable session persistence for OAuth
    detectSessionInUrl: true, // Enable OAuth callback detection
    flowType: 'pkce', // Use PKCE flow for better security
  },
})

export default supabase