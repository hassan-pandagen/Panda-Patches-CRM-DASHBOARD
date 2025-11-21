import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inline headers to prevent CORS/Import errors
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { user_id } = await req.json();
    if (!user_id) throw new Error("User ID is required");

    // Delete from Auth (Cascade deletes profile)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ message: "User deleted successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});