// supabase/functions/invite-customer/index.ts
// Provisions / re-invites a customer portal account after an order.
//   - New customer       -> create account (no password) + WEBSITE_AUTH_ORDER_ACCOUNT
//                           "set your password / track your order" email (lands on the website /reset-password)
//   - Returning customer -> magic login link (CUSTOMER_RETURNING_LOGIN), or a forced password
//                           reset (CUSTOMER_PASSWORD_RESET) when mode='reset_password'
//
// Callers:
//   - provision_customer_account() Postgres trigger — fires once per non-website order (automatic).
//   - Admin "Resend invite" button (CustomersPage) — manual, passes order_number 'N/A' and/or force:true.
//
// Idempotency: for a real order number (PP-…) the order's `invite_sent_at` is claimed atomically so
// exactly ONE invite is ever sent per order, even if several paths fire (frontend + trigger during a
// deploy gap). `force:true` or order_number 'N/A' (manual resend) bypasses the guard.
//
// Security: we NEVER email a password — only a time-limited Supabase invite/recovery link.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  'https://login.pandapatches.com',          // customer portal
  'https://portal.pandapatches.com',          // staff CRM (production)
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
  customer_phone: z.string().max(50).optional(),
  portal_url: z.string().url().optional(),
  // 'auto' (default): new = account email, returning = magic login link
  // 'reset_password': force a password recovery email even for returning customers
  mode: z.enum(['auto', 'reset_password']).optional().default('auto'),
  // Manual resends bypass the per-order once-guard.
  force: z.boolean().optional().default(false),
});

// Customer portal lives on the marketing website (CRM /customer/* routes were removed).
// Invite/recovery links must land on the WEBSITE's live, Supabase-allow-listed routes.
const WEBSITE_SET_PASSWORD_URL = 'https://www.pandapatches.com/reset-password';
const WEBSITE_LOGIN_CALLBACK_URL = 'https://www.pandapatches.com/auth/callback';

// Patch phone into customer_profiles (the on_customer_signup trigger doesn't populate it). That row
// is created by the trigger and may land a moment AFTER createUser returns, so retry briefly to win
// the race instead of silently losing the phone. Best-effort, only fills an empty phone.
async function patchCustomerPhone(admin: any, emailLc: string, phone: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const { data } = await admin
      .from('customer_profiles')
      .update({ phone })
      .ilike('email', emailLc)
      .is('phone', null)
      .select('id');
    if (data && data.length > 0) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

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
    const { email, customer_name, order_number, customer_phone, mode, force } = inviteSchema.parse(body);

    const emailLc = email.trim().toLowerCase();
    const setPasswordRedirect = WEBSITE_SET_PASSWORD_URL;
    const loginRedirect = WEBSITE_LOGIN_CALLBACK_URL;

    // 1. Block staff members from being invited as customers (case-insensitive).
    const { data: staffMember } = await admin
      .from('user_profiles')
      .select('id')
      .ilike('email', emailLc)
      .maybeSingle();

    if (staffMember) {
      return new Response(
        JSON.stringify({ error: 'This email belongs to a staff account and cannot be invited as a customer.' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 2. Per-order idempotency claim (real order numbers only; manual resends bypass).
    //    Atomic conditional UPDATE: only the first caller for this order proceeds; the rest skip.
    const isRealOrder = /^PP-/i.test(order_number) && order_number !== 'N/A';
    const useGuard = isRealOrder && !force;
    if (useGuard) {
      const { data: claimed, error: claimErr } = await admin
        .from('orders')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('order_number', order_number)
        .is('invite_sent_at', null)
        .select('id');
      if (claimErr) {
        console.error('[invite-customer] claim failed:', claimErr.message);
      } else if (!claimed || claimed.length === 0) {
        // Already sent for this order (or order row not found) — nothing to do.
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'invite already sent for this order' }),
          { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // Roll back the claim so a later retry can re-send if anything below fails.
    const rollbackClaim = async () => {
      if (useGuard) {
        await admin.from('orders').update({ invite_sent_at: null }).eq('order_number', order_number).catch(() => {});
      }
    };

    try {
      // 3. Is this customer already in the portal?
      const { data: existing } = await admin
        .from('customer_profiles')
        .select('id')
        .ilike('email', emailLc)
        .maybeSingle();

      let actionLink = '';
      let templateId: string;
      let createdNow = false;
      let createdUserId: string | null = null;

      if (!existing) {
        // New customer: create the auth account (no password), then send the "set your password" email.
        // app_metadata is server-controlled — users cannot modify it from the client.
        // is_customer:true routes the on_customer_signup trigger to create the customer_profiles row.
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: emailLc,
          email_confirm: true, // a paying customer's email is already verified by the transaction
          user_metadata: {
            full_name: customer_name,
            is_customer: true,
            phone: customer_phone || null,
            created_from: 'order',
          },
          app_metadata: {
            role: 'customer',
            password_set: false, // flipped to true by mark-password-set once they set a password
          },
        });

        if (createErr) {
          // Atomic de-dup: an "already registered" error means an orphan auth user exists from a
          // prior failed invite (no customer_profiles row). A recovery link works for existing users
          // and still lands on set-password. (This replaces a listUsers() scan that silently capped at
          // the first 50 users and missed orphans on our ~200-user base.)
          if (/already|exists|registered|been registered/i.test(createErr.message || '')) {
            const { data, error } = await admin.auth.admin.generateLink({
              type: 'recovery',
              email: emailLc,
              options: { redirectTo: setPasswordRedirect },
            });
            if (error) throw error;
            actionLink = data.properties?.action_link ?? '';
          } else {
            throw createErr;
          }
        } else {
          createdNow = true;
          createdUserId = created.user?.id ?? null;
          const { data, error } = await admin.auth.admin.generateLink({
            type: 'invite',
            email: emailLc,
            options: {
              redirectTo: setPasswordRedirect,
              data: { full_name: customer_name, is_customer: true },
            },
          });
          if (error) throw error;
          actionLink = data.properties?.action_link ?? '';
        }

        templateId = 'WEBSITE_AUTH_ORDER_ACCOUNT';
      } else {
        // Returning customer
        if (mode === 'reset_password') {
          const { data, error } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: emailLc,
            options: { redirectTo: setPasswordRedirect },
          });
          if (error) throw error;
          actionLink = data.properties?.action_link ?? '';
          templateId = 'CUSTOMER_PASSWORD_RESET';
        } else {
          // Default: magic login link so they can jump straight into tracking this new order.
          const { data, error } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: emailLc,
            options: { redirectTo: loginRedirect },
          });
          if (error) throw error;
          actionLink = data.properties?.action_link ?? '';
          templateId = 'CUSTOMER_RETURNING_LOGIN';
        }
      }

      if (!actionLink) throw new Error('Failed to generate portal link');

      // 4. Send via the shared send-email function
      const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          to: emailLc,
          template_id: templateId,
          dynamic_data: {
            customer_name,
            order_number,
            portal_action_url: actionLink,
            portal_login_url: 'https://www.pandapatches.com/login',
          },
        }),
      });

      if (!emailResp.ok) {
        const text = await emailResp.text();
        // Cleanup: if we just created this auth user and the email failed, delete the orphan so a
        // retry starts clean instead of getting stuck on a passwordless/unconfirmed row.
        if (createdNow && createdUserId) {
          await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
        }
        await rollbackClaim();
        throw new Error(`send-email failed: ${text}`);
      }

      // New customer's profile row now exists (created by the signup trigger) — fill phone. Best-effort.
      if (!existing && customer_phone) {
        await patchCustomerPhone(admin, emailLc, customer_phone);
      }

      return new Response(
        JSON.stringify({ success: true, new_customer: !existing, template: templateId }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
      );
    } catch (innerErr) {
      await rollbackClaim();
      throw innerErr;
    }
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
