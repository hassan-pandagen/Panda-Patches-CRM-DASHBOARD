// supabase/functions/get-users/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1. Define headers inline to prevent import errors
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // 2. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 3. Init Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    );
  }
});