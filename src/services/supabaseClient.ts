// src/services/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided in .env file");
}

// This file now ONLY creates and exports the public client.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Initializes the Supabase client with listeners that depend on other parts of the app,
 * like the TanStack Query client. This uses dependency injection to avoid circular imports.
 * @param queryClient The TanStack Query client instance.
 */
export const initializeSupabaseClient = (queryClient: QueryClient) => {
  supabase.auth.onAuthStateChange((event) => {
    // When the user signs out, clear the entire query cache to prevent
    // showing stale data for the next user who signs in.
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      queryClient.clear();
    }
  });
};
