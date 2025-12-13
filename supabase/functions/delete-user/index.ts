// supabase/functions/delete-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== DELETE USER FUNCTION START ===');
    
    // 1. Create Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    console.log('✓ Admin client created');

    // 2. Verify Authorization Header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('✗ No authorization header');
      throw new Error('No authorization header');
    }
    console.log('✓ Authorization header present');

    // 3. Get Calling User
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError) {
      console.error('✗ Auth error:', authError.message);
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    
    if (!user) {
      console.error('✗ No user found');
      throw new Error('User not authenticated');
    }
    
    console.log('✓ Calling user authenticated:', user.email);

    // 4. Check Admin Role or Manage Users Permission
    console.log('Fetching user profile with ID:', user.id);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role, permissions')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('✗ Profile fetch error:', profileError);
      console.error('Profile error message:', profileError.message);
      console.error('Profile error code:', profileError.code);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      console.error('✗ No profile data returned');
      throw new Error('No profile data returned for user');
    }

    console.log('✓ User profile fetched. Role:', profile.role);
    console.log('✓ Permissions:', profile.permissions);

    // Allow if ADMIN role OR has users_manage permission
    const isAdmin = profile.role === 'ADMIN';
    const canManageUsers = profile.permissions?.users_manage === true;
    
    if (!isAdmin && !canManageUsers) {
      console.error('✗ Insufficient permissions. User role:', profile.role, 'can_manage:', canManageUsers);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Admin role or users_manage permission required.' }), 
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('✓ Permissions verified (Admin:', isAdmin, 'or Manage Users:', canManageUsers, ')');

    // 5. Parse Request Body
    const body = await req.json();
    console.log('✓ Request body:', body);
    
    const { user_id } = body;
    
    if (!user_id) {
      console.error('✗ Missing user_id in body');
      throw new Error("Missing 'user_id' in request body");
    }
    
    console.log('✓ Target user_id:', user_id);

    // 6. Delete User from auth.users (cascades to user_profiles and related tables)
    console.log('Attempting to delete user from auth...');
    
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error('✗ Auth delete error:', deleteError.message);
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    console.log('✓ User successfully deleted');
    console.log('=== DELETE USER FUNCTION END ===');

    return new Response(
      JSON.stringify({ 
        message: "User successfully deleted",
        details: "User account and all associated data have been removed"
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('=== FUNCTION ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    
    // Determine appropriate status code
    let statusCode = 400;
    if (error.message?.includes('Insufficient permissions') || error.message?.includes('Admin role required')) {
      statusCode = 403;
    }
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal Server Error',
        details: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode
      }
    );
  }
});