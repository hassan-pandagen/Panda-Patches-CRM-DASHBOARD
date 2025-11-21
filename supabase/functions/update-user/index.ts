import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { user_id, email, password, full_name, role, permissions } = await req.json();
    
    if (!user_id) throw new Error("User ID is required");

    // 1. Update Auth (Email/Password/Metadata)
    const authAttributes: any = {
      user_metadata: { full_name, role, permissions }
    };
    if (email) authAttributes.email = email;
    if (password && password.trim() !== "") authAttributes.password = password;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id, 
      authAttributes
    );

    if (authError) throw authError;

    // 2. Update Database Profile
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        full_name,
        role,
        permissions,
        ...(email ? { email } : {})
      })
      .eq('id', user_id);

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ message: "User updated successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});