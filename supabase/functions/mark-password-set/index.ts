// supabase/functions/mark-password-set/index.ts
// Flips app_metadata.password_set = true for the calling user.
// Only the user themselves can flip their own flag (verified via JWT).
// app_metadata is server-side only — users cannot tamper with it from the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://login.pandapatches.com',
  'https://panda-patches-crm-dashboard.vercel.app',
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost:');
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      throw new Error('Supabase env vars not configured');
    }

    // Verify the caller is authenticated using their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error('Invalid session');

    // Confirm caller is a customer (not staff) — staff don't need this flag
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: staffRow } = await admin
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (staffRow) throw new Error('Staff users cannot use this endpoint');

    // Flip the flag in app_metadata
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata || {}),
        password_set: true,
        role: 'customer',
      },
    });
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('[mark-password-set] error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
