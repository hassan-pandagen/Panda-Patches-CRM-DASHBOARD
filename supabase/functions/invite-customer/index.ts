// supabase/functions/invite-customer/index.ts
// Sends a customer portal invite after an order is placed.
//   - New customer  -> invite link that lands on /customer/set-password
//   - Existing customer -> magic login link that lands on /customer/auth/callback
// Password-based login is used after the first password is set.

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

const inviteSchema = z.object({
  email: z.string().email().max(255),
  customer_name: z.string().max(200).optional().default('Customer'),
  order_number: z.string().max(100).optional().default('N/A'),
  portal_url: z.string().url().optional(),
});

const DEFAULT_PORTAL_URL = 'https://portal.pandapatches.com';

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
    const { email, customer_name, order_number, portal_url } = inviteSchema.parse(body);

    const portal = (portal_url || DEFAULT_PORTAL_URL).replace(/\/$/, '');
    const setPasswordRedirect = `${portal}/customer/set-password`;
    const loginRedirect = `${portal}/customer/auth/callback`;

    // 1. Is this customer already in the portal?
    //    (customer_profiles is auto-populated by the on_customer_signup trigger)
    const { data: existing } = await admin
      .from('customer_profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    // 2. Generate the right link for the situation
    let actionLink: string;
    let templateId: string;

    if (!existing) {
      // New customer - send invite that lets them set a password
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: setPasswordRedirect,
          data: { full_name: customer_name },
        },
      });
      if (error) throw error;
      actionLink = data.properties?.action_link ?? '';
      templateId = 'CUSTOMER_WELCOME_INVITE';
    } else {
      // Returning customer - send magic login link for this new order
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: loginRedirect },
      });
      if (error) throw error;
      actionLink = data.properties?.action_link ?? '';
      templateId = 'CUSTOMER_RETURNING_LOGIN';
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
