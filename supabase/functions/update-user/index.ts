import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://portal.pandapatches.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ✅ BACKEND VALIDATION: Zod schema for update user
const updateUserSchema = z.object({
  user_id: z.string()
    .uuid("Invalid user ID format"),

  email: z.string()
    .email("Invalid email format")
    .max(255, "Email too long")
    .optional(),

  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .optional(),

  full_name: z.string()
    .min(1, "Full name cannot be empty")
    .max(100, "Full name too long"),

  role: z.enum(['USER', 'ADMIN', 'PRODUCTION', 'AGENT'], {
    errorMap: () => ({ message: "Role must be USER, ADMIN, PRODUCTION, or AGENT" })
  }),

  permissions: z.record(
    z.enum([
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
    ]),
    z.boolean()
  ).optional()
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse and validate request body
    const body = await req.json();
    const validatedData = updateUserSchema.parse(body);

    const { user_id, email, password, full_name, role, permissions } = validatedData;

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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Handle other errors
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});