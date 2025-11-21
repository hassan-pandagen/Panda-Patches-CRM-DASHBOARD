// supabase/functions/create-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, role, fullName, access } = await req.json();
    if (!email) throw new Error("Email is required");

    // Generate Temp Password
    const temporaryPassword = crypto.randomUUID().slice(0, 12);

    // Create Auth User
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (createError) throw createError;
    if (!user) throw new Error("User creation failed");

    // Create Profile
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: email,
        full_name: fullName,
        role: role,
        permissions: access
      });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ user, temporaryPassword }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});