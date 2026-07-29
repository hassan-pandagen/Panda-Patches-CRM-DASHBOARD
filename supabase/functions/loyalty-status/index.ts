// supabase/functions/loyalty-status/index.ts
// CL86F1 — the read endpoint the WEBSITE calls SERVER-SIDE to render the account tier
// badge (Task 3). Maps the site's customer to the CRM by email (no new identity system).
//
//   POST { email }  → { tier, lifetime_paid_value, codes[] }
//
// Same server-to-server + shared-secret pattern as validate-loyalty-code (reuses the
// SAME LOYALTY_VALIDATE_SECRET). Deploy verify_jwt=false.

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
      return json({ error: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email) return json({ tier: 'none', lifetime_paid_value: 0, codes: [] });

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cust, error: cErr } = await db
      .from('customers')
      .select('id, loyalty_tier, lifetime_paid_value')
      .eq('normalized_email', email)
      .eq('is_active', true)
      .is('merged_into_id', null)
      .limit(1)
      .maybeSingle();
    if (cErr) throw cErr;

    if (!cust) return json({ tier: 'none', lifetime_paid_value: 0, codes: [] });

    // Only expose currently-usable codes (active, not expired). Redemption is the CRM's job.
    const { data: codes } = await db
      .from('loyalty_codes')
      .select('code, percent, tier, single_use, expires_at, status')
      .eq('customer_id', cust.id)
      .eq('status', 'active');

    const usable = (codes ?? []).filter(
      (c: any) => !c.expires_at || new Date(c.expires_at).getTime() >= Date.now()
    );

    return json({
      tier: cust.loyalty_tier ?? 'none',
      lifetime_paid_value: Number(cust.lifetime_paid_value ?? 0),
      codes: usable,
    });
  } catch (err: any) {
    console.error('[loyalty-status] error:', err?.message || err);
    return json({ error: 'server_error' }, 500);
  }
});
