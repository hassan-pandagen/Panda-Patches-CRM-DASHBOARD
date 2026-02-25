import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

// ✅ BACKEND VALIDATION: Zod schema for update user
// All fields except user_id are optional to support partial updates (e.g., password-only reset)
const updateUserSchema = z.object({
  user_id: z.string()
    .uuid("Invalid user ID format"),

  email: z.string()
    .email("Invalid email format")
    .max(255, "Email too long")
    .optional(),

  password: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(72, "Password too long")
    .optional(),

  full_name: z.string()
    .min(1, "Full name cannot be empty")
    .max(100, "Full name too long")
    .optional(),

  role: z.enum(['USER', 'ADMIN', 'PRODUCTION', 'AGENT'], {
    errorMap: () => ({ message: "Role must be USER, ADMIN, PRODUCTION, or AGENT" })
  }).optional(),

  permissions: z.record(
    z.enum([
      'users_manage',
      'orders_create',
      'orders_view_all',
      'orders_view_own_only',
      'orders_change_status',
      'orders_edit_financials',
      'orders_edit_production',
      'orders_delete',
      'reports_view_financials',
      'shipping_view',
      'attendance_clock_only'
    ]),
    z.boolean()
  ).optional()
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse and validate request body
    const body = await req.json();
    const validatedData = updateUserSchema.parse(body);

    const { user_id, email, password, full_name, role, permissions } = validatedData;

    // 1. Update Auth - only include fields that are provided
    const authAttributes: any = {};

    // Only update metadata if any metadata fields are provided
    if (full_name || role || permissions) {
      authAttributes.user_metadata = {};
      if (full_name) authAttributes.user_metadata.full_name = full_name;
      if (role) authAttributes.user_metadata.role = role;
      if (permissions) authAttributes.user_metadata.permissions = permissions;
    }

    if (email) authAttributes.email = email;
    if (password && password.trim() !== "") authAttributes.password = password;

    // Only call updateUserById if there's something to update in auth
    if (Object.keys(authAttributes).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        authAttributes
      );
      if (authError) throw authError;
    }

    // 2. Update Database Profile - only if profile fields are provided
    const profileUpdate: any = {};
    if (full_name) profileUpdate.full_name = full_name;
    if (role) profileUpdate.role = role;
    if (permissions) profileUpdate.permissions = permissions;
    if (email) profileUpdate.email = email;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update(profileUpdate)
        .eq('id', user_id);

      if (profileError) throw profileError;
    }

    return new Response(
      JSON.stringify({ message: "User updated successfully" }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const validationErrors = error.errors.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: validationErrors
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Handle other errors
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});