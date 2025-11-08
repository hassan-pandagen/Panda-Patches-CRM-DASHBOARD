import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
throw new Error('Supabase URL and Anon Key are required. Make sure to create a .env file in the root of your project.');
}

// Conditionally set storage options based on the environment.
// In development (localhost), use localStorage to avoid cross-domain cookie issues in Chrome.
// In production, use the default (more secure) cookie-based storage.
const isDevelopment = import.meta.env.DEV;
const storageOptions = isDevelopment
  ? {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  : {};

// Regular client for frontend usage
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, { auth: storageOptions });

// Admin client (backend only)
export const supabaseAdmin: SupabaseClient | null = supabaseServiceKey
? createClient(supabaseUrl, supabaseServiceKey, {
auth: { autoRefreshToken: false, persistSession: false }
})
: null;

console.log('Supabase clients initialized:', {
hasRegularClient: !!supabase,
hasAdminClient: !!supabaseAdmin
});
