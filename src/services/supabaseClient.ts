
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// --- ACTION REQUIRED ---
// PASTE YOUR SUPABASE URL AND PUBLIC ANON KEY BELOW
// You can find these in your Supabase project's "Project Settings" > "API" section.
//
// ⚠️ IMPORTANT SECURITY WARNING ⚠️
// NEVER use a 'service_role' or 'secret' key in your frontend code. 
// Always use the public 'anon' key. The service_role key gives full admin access to your database
// and should only be used in a secure backend server environment.

// I have populated these values from your screenshot to connect to your project.
const supabaseUrl: string = 'https://uxgzlneefybifvccfhwp.supabase.co'; 
const supabaseAnonKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4Z3psbmVlZnliaWZ2Y2NmaHdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MTE4NTcsImV4cCI6MjA3MzE4Nzg1N30.Yx8gBhAbRm3j3lK0eD5VQ5pheXVgL3YuvbWPWllPNaM';

// -------------------------

if (!supabaseUrl || supabaseUrl.includes('YOUR_SUPABASE_URL') || !supabaseAnonKey || supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY')) {
    // This error will be thrown if the placeholders are not replaced.
    // This helps in debugging setup issues and ensures you've configured it correctly.
    const root = document.getElementById('root');
    if(root) {
        root.innerHTML = `
        <div style="font-family: sans-serif; padding: 2rem; text-align: center; background: #fff1f2; color: #9f1239; border: 1px solid #fecaca; border-radius: 8px; margin: 2rem;">
            <h1 style="font-size: 1.5rem; font-weight: bold;">Configuration Error</h1>
            <p>Supabase URL and anon key are required.</p>
            <p>Please open the file <strong>src/services/supabaseClient.ts</strong> and replace the placeholder values with your actual Supabase credentials.</p>
        </div>
        `;
    }
    throw new Error("Supabase URL and anon key are required. Please replace the placeholder values in 'src/services/supabaseClient.ts'.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
