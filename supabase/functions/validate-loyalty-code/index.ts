// supabase/functions/validate-loyalty-code/index.ts
// CL86F1 loyalty engine — the endpoint the WEBSITE calls SERVER-SIDE to validate a
// customer's loyalty code before applying a discount to a Square payment link.
//
// Contract (see docs/crm-website-handoff-loyalty.md):
//   POST { code, email, order_context: { pricing_source } }
//   → { valid, percent, tier, reason }
//
// Enforces every rule from the brief:
//   - code exists                          reason: 'code_not_found'
//   - code belongs to THIS email           reason: 'email_mismatch'
//   - code not revoked                     reason: 'revoked'
//   - not expired (Bronze 90-day)          reason: 'expired'
//   - single-use (Bronze) not yet redeemed reason: 'already_used'
//   - calculator pricing only, no stacking reason: 'not_combinable_with_custom_quotes'
//   - valid                                reason: 'ok'
//
// Auth: server-to-server only. NOT JWT-protected (deploy verify_jwt=false); guarded by
// a shared secret header so only the website's backend can call it — the service role
// key is never shared with the website.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-loyalty-secret',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const SECRET       = Deno.env.get('LOYALTY_VALIDATE_SECRET') ?? '';
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!SECRET) throw new Error('LOYALTY_VALIDATE_SECRET not configured');

    if (req.headers.get('x-loyalty-secret') !== SECRET) {
      return json({ valid: false, reason: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const code  = String(body?.code ?? '').trim().toUpperCase();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const pricingSource = String(body?.order_context?.pricing_source ?? '').trim().toLowerCase();

    if (!code || !email) {
      return json({ valid: false, tier: null, percent: 0, reason: 'code_not_found' });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Look up the code + its owning customer's normalized email.
    const { data: rows, error } = await db
      .from('loyalty_codes')
      .select('id, code, tier, percent, single_use, expires_at, status, customer:customers!inner(normalized_email)')
      .eq('code', code)
      .limit(1);
    if (error) throw error;

    const row: any = rows?.[0];
    if (!row) {
      return json({ valid: false, tier: null, percent: 0, reason: 'code_not_found' });
    }

    // Email must match the code's owner (codes are personal / email-bound).
    const ownerEmail = String(row.customer?.normalized_email ?? '').toLowerCase();
    if (ownerEmail !== email) {
      return json({ valid: false, tier: row.tier, percent: 0, reason: 'email_mismatch' });
    }

    if (row.status === 'revoked') {
      return json({ valid: false, tier: row.tier, percent: 0, reason: 'revoked' });
    }

    // Expiry (Bronze codes carry a 90-day expires_at; Silver/Gold are null = no expiry).
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return json({ valid: false, tier: row.tier, percent: 0, reason: 'expired' });
    }

    // Single-use (Bronze): once redeemed, it's spent.
    if (row.single_use && row.status === 'redeemed') {
      return json({ valid: false, tier: row.tier, percent: 0, reason: 'already_used' });
    }

    // Margin-protection: loyalty discounts apply to STANDARD CALCULATOR PRICING ONLY —
    // never stacked on custom/negotiated quotes or other promos.
    if (pricingSource !== 'calculator') {
      return json({ valid: false, tier: row.tier, percent: 0, reason: 'not_combinable_with_custom_quotes' });
    }

    return json({ valid: true, tier: row.tier, percent: row.percent, reason: 'ok' });
  } catch (err: any) {
    console.error('[validate-loyalty-code] error:', err?.message || err);
    return json({ valid: false, reason: 'server_error' }, 500);
  }
});
