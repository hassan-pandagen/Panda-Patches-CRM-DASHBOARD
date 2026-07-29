// supabase/functions/loyalty-email-cron/index.ts
// CL86F1 loyalty emails. Daily (pg_cron → pg_net → here). Auth: x-cron-secret header.
//
//   E1/E2/E3  Award emails for NEW codes (award_email_sent_at IS NULL). Bronze/Silver go
//             to the customer; Gold is DRAFTED to Imran's inbox for one-click send.
//   E4        Bronze-expiry reminder (~30 days before the 90-day expiry, unredeemed, once).
//   E5        Near-threshold nudge (within 20% of the next tier), max 1/quarter, skipped if
//             a remake is open in the last 30 days.
//
// Suppression rules from the brief:
//   - Awards are transactional: always send once; they reset the 14-day window.
//   - E4/E5 are marketing: respect a 14-day global cap per customer (loyalty_last_email_at).
//   - E5 additionally capped to once per quarter (loyalty_nudge_sent_at).
// Awards run first so a same-day award "wins" and defers E4/E5 naturally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAY = 24 * 60 * 60 * 1000;
const THRESHOLDS = { bronze: 1000, silver: 5000, gold: 10000 };
const NEXT: Record<string, { tier: string; threshold: number; benefit: string } | null> = {
  none:   { tier: 'Bronze', threshold: 1000,  benefit: 'a personal 5% code' },
  bronze: { tier: 'Silver', threshold: 5000,  benefit: 'free Velcro on every order + priority mockups' },
  silver: { tier: 'Gold',   threshold: 10000, benefit: '10% off + a free rush upgrade every quarter' },
  gold:   null,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const CRON_SECRET  = Deno.env.get('LOYALTY_CRON_SECRET') ?? '';
    const IMRAN_INBOX  = Deno.env.get('LOYALTY_GOLD_DRAFT_TO') ?? 'sales@pandapatches.com';
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!CRON_SECRET) throw new Error('LOYALTY_CRON_SECRET not configured');
    if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'unauthorized' }, 401);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const now = Date.now();

    const fmtDate = (d: string | null) =>
      d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

    const sendEmail = async (to: string, template_id: string, data: any): Promise<boolean> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ to, template_id, dynamic_data: data }),
        });
        return res.ok;
      } catch (err) {
        console.error('[loyalty-email-cron] send failed:', err);
        return false;
      }
    };
    const stampLastEmail = (customerId: string) =>
      db.from('customers').update({ loyalty_last_email_at: new Date().toISOString() }).eq('id', customerId);

    let awards = 0, reminders = 0, nudges = 0;

    // ── E1/E2/E3 — award emails for new codes ────────────────────────────────
    const { data: newCodes } = await db
      .from('loyalty_codes')
      .select('id, code, tier, expires_at, customer:customers!inner(id, full_name, normalized_email)')
      .is('award_email_sent_at', null);

    for (const c of (newCodes ?? []) as any[]) {
      // Claim first (at-most-once): stamp before sending.
      const { data: claimed } = await db
        .from('loyalty_codes')
        .update({ award_email_sent_at: new Date().toISOString() })
        .eq('id', c.id).is('award_email_sent_at', null).select('id');
      if (!claimed || claimed.length === 0) continue;

      const cust = c.customer;
      if (c.tier === 'gold') {
        // Drafted to Imran, not auto-sent to the customer.
        const ok = await sendEmail(IMRAN_INBOX, 'LOYALTY_GOLD_DRAFT', {
          customer_name: cust.full_name || '', customer_email: cust.normalized_email, code: c.code,
        });
        awards += ok ? 1 : 0;
      } else {
        const template = c.tier === 'silver' ? 'LOYALTY_SILVER_AWARDED' : 'LOYALTY_BRONZE_AWARDED';
        const ok = await sendEmail(cust.normalized_email, template, {
          customer_name: cust.full_name || '', code: c.code, expiry: fmtDate(c.expires_at),
        });
        if (ok) { awards++; await stampLastEmail(cust.id); }
      }
    }

    // ── E4 — Bronze expiry reminder (~30 days out, unredeemed, once) ──────────
    const remWindowLo = new Date(now + 29 * DAY).toISOString();
    const remWindowHi = new Date(now + 31 * DAY).toISOString();
    const { data: expiring } = await db
      .from('loyalty_codes')
      .select('id, code, expires_at, customer:customers!inner(id, full_name, normalized_email, loyalty_last_email_at)')
      .eq('tier', 'bronze').eq('single_use', true).eq('status', 'active')
      .is('reminder_sent_at', null)
      .gte('expires_at', remWindowLo).lte('expires_at', remWindowHi);

    for (const c of (expiring ?? []) as any[]) {
      const cust = c.customer;
      // 14-day global cap (marketing).
      if (cust.loyalty_last_email_at && now - new Date(cust.loyalty_last_email_at).getTime() < 14 * DAY) continue;
      const { data: claimed } = await db
        .from('loyalty_codes')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', c.id).is('reminder_sent_at', null).select('id');
      if (!claimed || claimed.length === 0) continue;
      const ok = await sendEmail(cust.normalized_email, 'LOYALTY_BRONZE_EXPIRY', {
        customer_name: cust.full_name || '', code: c.code, expiry: fmtDate(c.expires_at),
      });
      if (ok) { reminders++; await stampLastEmail(cust.id); }
    }

    // ── E5 — near-threshold nudge (within 20% of next tier) ───────────────────
    // Candidate: lifetime in [0.8*next, next) for its current tier's next step.
    const { data: candidates } = await db
      .from('customers')
      .select('id, full_name, normalized_email, loyalty_tier, lifetime_paid_value, loyalty_nudge_sent_at, loyalty_last_email_at')
      .eq('is_active', true).is('merged_into_id', null)
      .neq('loyalty_tier', 'gold');

    // Customers with a remake opened in the last 30 days — skip them (brief).
    const recentRemakeEmails = new Set<string>();
    const { data: remakes } = await db
      .from('orders')
      .select('customer_email')
      .eq('status', 'REMAKE')
      .gte('updated_at', new Date(now - 30 * DAY).toISOString());
    for (const r of remakes ?? []) recentRemakeEmails.add(String((r as any).customer_email || '').toLowerCase().trim());

    for (const cust of (candidates ?? []) as any[]) {
      const nxt = NEXT[cust.loyalty_tier];
      if (!nxt) continue;
      const paid = Number(cust.lifetime_paid_value ?? 0);
      if (!(paid >= 0.8 * nxt.threshold && paid < nxt.threshold)) continue;                 // within 20%
      if (recentRemakeEmails.has(cust.normalized_email)) continue;                           // open remake
      if (cust.loyalty_nudge_sent_at && now - new Date(cust.loyalty_nudge_sent_at).getTime() < 90 * DAY) continue;   // 1/quarter
      if (cust.loyalty_last_email_at && now - new Date(cust.loyalty_last_email_at).getTime() < 14 * DAY) continue;   // 14-day cap

      // Claim the quarterly nudge slot first.
      const { data: claimed } = await db
        .from('customers')
        .update({ loyalty_nudge_sent_at: new Date().toISOString() })
        .eq('id', cust.id)
        .or(`loyalty_nudge_sent_at.is.null,loyalty_nudge_sent_at.lt.${new Date(now - 90 * DAY).toISOString()}`)
        .select('id');
      if (!claimed || claimed.length === 0) continue;

      const ok = await sendEmail(cust.normalized_email, 'LOYALTY_NEAR_THRESHOLD', {
        customer_name: cust.full_name || '',
        amount_to_next: fmtMoney(nxt.threshold - paid),
        next_tier: nxt.tier,
        top_benefit: nxt.benefit,
      });
      if (ok) { nudges++; await stampLastEmail(cust.id); }
    }

    const summary = { awards, reminders, nudges, ranAt: new Date().toISOString() };
    console.log('[loyalty-email-cron]', JSON.stringify(summary));
    return json({ ok: true, ...summary });
  } catch (err: any) {
    console.error('[loyalty-email-cron] error:', err?.message || err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});
