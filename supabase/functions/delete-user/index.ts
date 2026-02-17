// supabase/functions/delete-user/index.ts
// FIXED VERSION - Proper deletion sequence with database cleanup

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const createResponse = (body: any, status = 200, headers: Record<string, string>) => {
  return new Response(
    JSON.stringify(body),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
      status
    }
  );
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    console.log('=== DELETE USER REQUEST STARTED ===');
    
    // ==========================================
    // LAYER 1: ENVIRONMENT VALIDATION
    // ==========================================
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      throw new Error('Missing required environment variables');
    }

    // ==========================================
    // LAYER 2: AUTHENTICATION & AUTHORIZATION
    // ==========================================
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createResponse({ error: 'Missing authorization header' }, 401, getCorsHeaders(req));
    }

    // Create client with user's token
    const supabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return createResponse({
        error: 'Authentication failed',
        details: authError?.message
      }, 401, getCorsHeaders(req));
    }

    console.log('✓ User authenticated:', user.email);

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user has ADMIN role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Failed to verify permissions:', profileError);
      return createResponse({
        error: 'Failed to verify permissions',
        details: profileError.message
      }, 500, getCorsHeaders(req));
    }

    if (profile?.role !== 'ADMIN') {
      console.error('Permission denied for user:', profile?.email);
      return createResponse({
        error: 'Insufficient permissions',
        required: 'ADMIN',
        current: profile?.role || 'UNKNOWN'
      }, 403, getCorsHeaders(req));
    }

    console.log('✓ Permissions verified: ADMIN');

    // ==========================================
    // LAYER 3: REQUEST VALIDATION
    // ==========================================
    
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return createResponse({ error: 'Invalid JSON in request body' }, 400, getCorsHeaders(req));
    }

    const { user_id } = body;
    
    if (!user_id) {
      return createResponse({
        error: 'Missing required field',
        field: 'user_id'
      }, 400, getCorsHeaders(req));
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id)) {
      return createResponse({
        error: 'Invalid user_id format',
        expected: 'UUID',
        received: user_id
      }, 400, getCorsHeaders(req));
    }

    // Prevent self-deletion
    if (user_id === user.id) {
      return createResponse({
        error: 'Cannot delete your own account'
      }, 400, getCorsHeaders(req));
    }

    console.log('✓ Request validated. Target user ID:', user_id);

    // ==========================================
    // LAYER 4: FETCH USER DETAILS FIRST
    // ==========================================
    
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('user_profiles')
      .select('email, role')
      .eq('id', user_id)
      .single();

    if (fetchError || !targetUser) {
      console.error('User not found:', user_id);
      return createResponse({
        error: 'User not found',
        user_id: user_id
      }, 404, getCorsHeaders(req));
    }

    console.log('✓ Target user found:', targetUser.email);

    // ==========================================
    // LAYER 5: DATABASE CLEANUP (CRITICAL FIX)
    // ==========================================
    
    // Step 1: Delete related records that might block deletion
    console.log('→ Cleaning up related records...');

    // Delete order history (if any orders exist for this user)
    const { error: historyError } = await supabaseAdmin
      .from('order_history')
      .delete()
      .eq('user_email', targetUser.email);
    
    if (historyError) {
      console.warn('Warning: Could not delete order history:', historyError.message);
    }

    // Delete order communications
    const { error: commError } = await supabaseAdmin
      .from('order_communications')
      .delete()
      .eq('user_email', targetUser.email);
    
    if (commError) {
      console.warn('Warning: Could not delete communications:', commError.message);
    }

    // Delete performance metrics
    const { error: metricsError } = await supabaseAdmin
      .from('performance_metrics')
      .delete()
      .eq('user_id', user_id);
    
    if (metricsError) {
      console.warn('Warning: Could not delete performance metrics:', metricsError.message);
    }

    // Delete attendance sessions
    const { error: attendanceError } = await supabaseAdmin
      .from('attendance_sessions')
      .delete()
      .eq('user_id', user_id);
    
    if (attendanceError) {
      console.warn('Warning: Could not delete attendance sessions:', attendanceError.message);
    }

    // Delete attendance summary
    const { error: summaryError } = await supabaseAdmin
      .from('attendance_summary')
      .delete()
      .eq('user_id', user_id);
    
    if (summaryError) {
      console.warn('Warning: Could not delete attendance summary:', summaryError.message);
    }

    // Update orders created by this user to set created_by to NULL
    const { error: ordersUpdateError } = await supabaseAdmin
      .from('orders')
      .update({ created_by: null })
      .eq('created_by', user_id);
    
    if (ordersUpdateError) {
      console.warn('Warning: Could not update orders created_by:', ordersUpdateError.message);
    }

    // Update monthly costs added by this user
    const { error: costsUpdateError } = await supabaseAdmin
      .from('monthly_costs')
      .update({ added_by: null })
      .eq('added_by', user_id);
    
    if (costsUpdateError) {
      console.warn('Warning: Could not update monthly costs:', costsUpdateError.message);
    }

    console.log('✓ Related records cleaned up');

    // ==========================================
    // LAYER 6: DELETE USER PROFILE
    // ==========================================
    
    console.log('→ Deleting user profile from user_profiles...');
    
    const { error: profileDeleteError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', user_id);

    if (profileDeleteError) {
      console.error('Failed to delete user profile:', profileDeleteError);
      return createResponse({
        error: 'Failed to delete user profile',
        details: profileDeleteError.message
      }, 500, getCorsHeaders(req));
    }

    console.log('✓ User profile deleted');

    // ==========================================
    // LAYER 7: DELETE AUTH USER (FINAL STEP)
    // ==========================================
    
    console.log('→ Deleting user from auth.users...');
    
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      console.error('Failed to delete auth user:', deleteError);
      return createResponse({
        error: 'Failed to delete user from authentication',
        details: deleteError.message
      }, 500, getCorsHeaders(req));
    }

    console.log('✓ Auth user deleted successfully');
    console.log('=== DELETE USER COMPLETED ===');

    // Success response
    return createResponse({
      success: true,
      message: 'User deleted successfully',
      deleted_user_email: targetUser.email,
      deleted_user_id: user_id
    }, 200, getCorsHeaders(req));

  } catch (error: any) {
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return createResponse({
      error: 'Internal server error',
      message: error.message,
      type: error.name
    }, 500, getCorsHeaders(req));
  }
});