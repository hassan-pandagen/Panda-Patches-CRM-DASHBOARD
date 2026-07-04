// supabase/functions/create-user/index.ts
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

// ✅ BACKEND VALIDATION: Zod schemas for input validation
const createUserSchema = z.object({
  email: z.string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email too long"),

  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),

  role: z.enum(['USER', 'ADMIN', 'PRODUCTION', 'SALES_AGENT', 'SHIPPING', 'AGENT'], {
    errorMap: () => ({ message: "Role must be USER, ADMIN, PRODUCTION, SALES_AGENT, SHIPPING, or AGENT" })
  }),

  fullName: z.string()
    .min(1, "Full name is required")
    .max(100, "Full name too long"),

  access: z.record(
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── AUTHORIZATION: only an admin / user-manager may create users ──
    // The UI hides User Management, but the endpoint itself must enforce this —
    // otherwise any logged-in user could call it directly with their own token.
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

    // 1. Parse and validate request body
    const body = await req.json();
    const validatedData = createUserSchema.parse(body);

    const { email, password, role, fullName, access } = validatedData;

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