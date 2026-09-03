// supabase/functions/colour-match-cron/index.ts
// Colour-match chase timers (item 5 of the colour-match-gate brief).
//
// Runs HOURLY, not daily. "24h reminder / 48h agent follow-up" is an SLA, and a daily
// job turns a 24h promise into anywhere between 24 and 48 hours. Hourly costs nothing
// here — colour_match_chase_queue() is a partial-index lookup over a handful of rows.
//
// ── The one thing this must never do ───────────────────────────────────────────
// It never writes matched_yarn. Not on reminder, not on follow-up, not on give-up.
// Only the customer's own approval (respond_to_colour_match) opens the gate. If this
// function is broken, wedged, or never deployed, the worst outcome is that nobody is
// chased — the order simply stays blocked, which is the safe direction. That is the
// whole point of putting the gate in a trigger rather than in a workflow.
//
// Idempotency is by stamp: colour_reminder_sent_at / colour_followup_flagged_at are
// written only after a successful send, and the queue function excludes anything
// already stamped. A failed send leaves the row in the queue for the next hour.
//
// Auth: cron-triggered, deploy with verify_jwt=false, guarded by a shared secret.

import { createClient } from "jsr:@supabase/supabase-js@2";

// jsr:, not esm.sh — the esm.sh build of supabase-js pulls in Node's `ws` and 500s on
// cold boot. That was the 2026-08-08 Square webhook outage. See PROJECT-KNOWLEDGE §9.1.

const FALLBACK_INTERNAL = 'hello@pandapatches.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const CRON_SECRET  = Deno.env.get('COLOUR_MATCH_CRON_SECRET') ?? '';
    const PORTAL_URL   = Deno.env.get('PORTAL_BASE_URL') ?? 'https://portal.pandapatches.com';
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!CRON_SECRET) throw new Error('COLOUR_MATCH_CRON_SECRET not configured');

    if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    const sendEmail = async (to: string, template_id: string, data: any): Promise<boolean> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ to, template_id, dynamic_data: data }),
        });
        return res.ok;
      } catch (err) {
        console.error('[colour-match-cron] send-email call failed:', err);
        return false;
      }
    };

    // Suppression registry — an erasure request outranks a chase email.
    const { data: optOutRows } = await db.from('customer_privacy_optouts').select('email');
    const optedOut = new Set((optOutRows ?? []).map((r: any) => String(r.email).toLowerCase().trim()));

    const { data: queue, error: qErr } = await db.rpc('colour_match_chase_queue');
    if (qErr) throw qErr;

    let reminders = 0, followups = 0, skipped = 0;

    for (const row of queue ?? []) {
      const confirmUrl = `${PORTAL_URL}/colour-match/${row.colour_confirm_token}`;
      const shared = {
        order_number:          row.order_number,
        customer_name:         row.customer_name,
        design_name:           row.design_name,
        quantity:              row.patches_quantity,
        customer_colour_input: row.customer_colour_input,
        colour_proposed_yarn:  row.colour_proposed_yarn,
        portal_action_url:     confirmUrl,
        portal_login_url:      confirmUrl,   // renders the "button not working" fallback line
      };

      if (row.action === 'reminder') {
        if (optedOut.has(String(row.customer_email || '').toLowerCase().trim())) {
          // Still stamp it, or this row is re-examined every hour forever.
          await db.from('orders').update({ colour_reminder_sent_at: new Date().toISOString() }).eq('id', row.id);
          skipped++;
          continue;
        }
        const ok = await sendEmail(row.customer_email, 'CUSTOMER_COLOUR_MATCH_REMINDER', shared);
        if (ok) {
          await db.from('orders').update({ colour_reminder_sent_at: new Date().toISOString() }).eq('id', row.id);
          reminders++;
        }
        continue;
      }

      // 48h: hand it to a person. The customer has now had a first email and a reminder
      // and still hasn't answered, so the next move is a call, not a third email.
      // sales_agent is 'WEB_CHECKOUT' on checkout orders, which is not an address.
      const agent = String(row.sales_agent || '');
      const to = agent.includes('@') ? agent : FALLBACK_INTERNAL;
      const ok = await sendEmail(to, 'INTERNAL_COLOUR_MATCH_FOLLOWUP', {
        ...shared,
        order_link: `${PORTAL_URL}/order/${row.order_number}`,
        customer_email: row.customer_email,
      });
      if (ok) {
        await db.from('orders').update({ colour_followup_flagged_at: new Date().toISOString() }).eq('id', row.id);
        followups++;
      }
    }

    console.log(`[colour-match-cron] reminders=${reminders} followups=${followups} skipped=${skipped} queue=${(queue ?? []).length}`);

    return new Response(
      JSON.stringify({ success: true, reminders, followups, skipped, queued: (queue ?? []).length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[colour-match-cron] failed:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
