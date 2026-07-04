// supabase/functions/get-users/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1. Define allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://portal.pandapatches.com',
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
  // 2. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // 3. Init Admin Client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── AUTHORIZATION: only an admin / user-manager may list users ──
    // This returns every user's email/role/permissions, so the caller must be
    // verified server-side — not merely authenticated.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 401 });
    }
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 401 });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles').select('role, permissions').eq('id', caller.id).single();
    const canManageUsers = callerProfile?.role === 'ADMIN' || callerProfile?.permissions?.users_manage === true;
    if (!canManageUsers) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 403 });
    }

    // 4. Fetch Profiles (only needed columns, not heavy data)
    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, full_name, role, permissions')
      .order('full_name', { ascending: true });

    if (error) throw error;

    // 5. Return Data
    return new Response(
      JSON.stringify({ users: profiles }),
      { 
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});