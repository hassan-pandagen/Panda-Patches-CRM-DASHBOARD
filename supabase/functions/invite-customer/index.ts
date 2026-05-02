// supabase/functions/invite-customer/index.ts
// Sends a customer portal invite after an order is placed.
//   - New customer  -> invite link that lands on /customer/set-password
//   - Existing customer -> magic login link that lands on /customer/auth/callback
// Password-based login is used after the first password is set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  'https://login.pandapatches.com',
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

const inviteSchema = z.object({
  email: z.string().email().max(255),
  customer_name: z.string().max(200).optional().default('Customer'),
  order_number: z.string().max(100).optional().default('N/A'),
  portal_url: z.string().url().optional(),
  // 'auto' (default): new = invite, returning = magic link
  // 'reset_password': force a password recovery email even for returning customers
  mode: z.enum(['auto', 'reset_password']).optional().default('auto'),
});

const DEFAULT_PORTAL_URL = 'https://login.pandapatches.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase admin env vars not configured');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const { email, customer_name, order_number, portal_url, mode } = inviteSchema.parse(body);

    const portal = (portal_url || DEFAULT_PORTAL_URL).replace(/\/$/, '');
    const setPasswordRedirect = `${portal}/customer/set-password`;
    const loginRedirect = `${portal}/customer/auth/callback`;

    // 1. Block staff members from being invited as customers
    const { data: staffMember } = await admin
      .from('user_profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (staffMember) {
      return new Response(
        JSON.stringify({ error: 'This email belongs to a staff account and cannot be invited as a customer.' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 2. Is this customer already in the portal?
    const { data: existing } = await admin
      .from('customer_profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    // 3. Generate the right link for the situation
    let actionLink: string;
    let templateId: string;

    if (!existing) {
      // New customer flow:
      //   1. Check if auth.users entry already exists (e.g. from a prior failed invite)
      //   2. If not, create the auth user with app_metadata flags
      //   3. Generate an invite link that lands on /customer/set-password

      // Step 1: check for existing auth user (rare edge case)
      const { data: { users: existingUsers } } = await admin.auth.admin.listUsers();
      const existingAuthUser = existingUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (!existingAuthUser) {
        // Step 2: Create the user with proper app_metadata
        // app_metadata is server-controlled — users CANNOT modify it from the client
        const { error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: customer_name, is_customer: true },
          app_metadata: {
            role: 'customer',
            password_set: false,  // ← will be flipped to true by mark-password-set after they set their password
          },
        });
        if (createErr) throw createErr;
      }

      // Step 3: Generate the invite link
      // This link will log them in, but the password_set: false flag
      // FORCES them through /customer/set-password before they can reach the dashboard.
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: setPasswordRedirect,
          data: { full_name: customer_name, is_customer: true },
        },
      });
      if (error) throw error;
      actionLink = data.properties?.action_link ?? '';
      templateId = 'CUSTOMER_WELCOME_INVITE';
    } else {
      // Returning customer
      if (mode === 'reset_password') {
        // Send password recovery email — lands on /customer/set-password
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: setPasswordRedirect },
        });
        if (error) throw error;
        actionLink = data.properties?.action_link ?? '';
        templateId = 'CUSTOMER_PASSWORD_RESET';
      } else {
        // Default: magic login link for this new order
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo: loginRedirect },
        });
        if (error) throw error;
        actionLink = data.properties?.action_link ?? '';
        templateId = 'CUSTOMER_RETURNING_LOGIN';
      }
    }

    if (!actionLink) throw new Error('Failed to generate portal link');

    // 3. Send via the existing send-email function
    const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        template_id: templateId,
        dynamic_data: {
          customer_name,
          order_number,
          portal_action_url: actionLink,
          portal_login_url: `${portal}/customer/login`,
        },
      }),
    });

    if (!emailResp.ok) {
      const text = await emailResp.text();
      throw new Error(`send-email failed: ${text}`);
    }

    return new Response(
      JSON.stringify({ success: true, new_customer: !existing, template: templateId }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: error.errors }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    console.error('[invite-customer] error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
