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

    // 1. Get password from request
    const { email, password, role, fullName, access } = await req.json();
    
    if (!email || !password) throw new Error("Email and Password are required");

    // ✅ SECURITY FIX: Validate permission object structure
    const VALID_PERMISSIONS = new Set([
      'users_manage',
      'orders_create',
      'orders_view_all',
      'orders_change_status',
      'orders_edit_financials',
      'orders_edit_production',
      'orders_delete',
      'reports_view_financials',
      'shipping_view',
      'attendance_clock_only'
    ]);

    if (access && typeof access === 'object') {
      for (const key of Object.keys(access)) {
        if (!VALID_PERMISSIONS.has(key)) {
          throw new Error(`Invalid permission: ${key}. Allowed: ${Array.from(VALID_PERMISSIONS).join(', ')}`);
        }
        if (typeof access[key] !== 'boolean') {
          throw new Error(`Permission ${key} must be boolean, got ${typeof access[key]}`);
        }
      }
    } else if (access) {
      throw new Error("Permissions must be an object");
    }

    // 2. Create User with Auto-Confirm
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,   // Set the password immediately
      email_confirm: true,  // <--- CRITICAL: Marks email as verified immediately
      user_metadata: { full_name: fullName }
    });

    if (createError) throw createError;
    if (!user) throw new Error("User creation failed");

    // 3. Update Profile Permissions
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        role: role,
        permissions: access
      })
      .eq('id', user.id);

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});