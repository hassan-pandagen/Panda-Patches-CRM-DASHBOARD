// supabase/functions/review-invite-cron/index.ts
// MASTER v3 review-generation program. Runs once a day (pg_cron → pg_net → here).
//
// What it does, compliance-first (Trustpilot + FTC 2024 — ask everyone once, one
// reminder max, no incentives, no gating):
//   1. INVITES  — every order delivered 2–5 days ago that hasn't been asked yet and
//      isn't opted out → send CUSTOMER_REVIEW_INVITE, record it. (The 2–5 day window,
//      rather than a strict 24h slice, catches up cleanly if a daily run is missed.)
//   2. REMINDERS — every invite 5+ days old with no reminder → send ONE
//      CUSTOMER_REVIEW_REMINDER, then mark it. Never a second reminder.
//
// Auth: this is an internal, cron-triggered endpoint. It is NOT protected by JWT
// (deploy with verify_jwt=false); instead it requires a shared secret header so only
// the scheduler can invoke it. Sending goes through the existing send-email function,
// which already owns the plain-text, from-Imran review templates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// How long after delivery to ask, and how long after the invite to send the one reminder.
const INVITE_MIN_AGE_DAYS = 2;   // don't ask until 2 days post-delivery
const INVITE_MAX_AGE_DAYS = 5;   // ...and give up if it's been sitting >5 days un-invited
const REMINDER_AFTER_DAYS = 5;   // one reminder, 5 days after the invite

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const CRON_SECRET  = Deno.env.get('REVIEW_CRON_SECRET') ?? '';
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!CRON_SECRET) throw new Error('REVIEW_CRON_SECRET not configured');

    // Only the scheduler (which knows the secret) may trigger a send run.
    if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const now = Date.now();
    const inviteFloor = new Date(now - INVITE_MAX_AGE_DAYS * DAY_MS).toISOString(); // oldest we'll still ask
    const inviteCeil  = new Date(now - INVITE_MIN_AGE_DAYS * DAY_MS).toISOString(); // youngest we'll ask
    const reminderCeil = new Date(now - REMINDER_AFTER_DAYS * DAY_MS).toISOString();

    // Opt-out registry (erasure/suppression). Emails are stored lowercase/trimmed.
    const { data: optOutRows } = await db
      .from('customer_privacy_optouts')
      .select('email');
    const optedOut = new Set((optOutRows ?? []).map((r: any) => String(r.email).toLowerCase().trim()));

    const isOptedOut = (email: string) => optedOut.has(String(email || '').toLowerCase().trim());

    const sendEmail = async (to: string, template_id: string, data: any): Promise<boolean> => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ to, template_id, dynamic_data: data }),
        });
        return res.ok;
      } catch (err) {
        console.error('[review-invite-cron] send-email call failed:', err);
        return false;
      }
    };

    // ── 1) INVITES ──────────────────────────────────────────────────────────
    // Orders delivered in the ask window. Already-invited orders are excluded via the
    // review_invitations claim below (UNIQUE(order_id) is the real guard).
    const { data: candidates, error: candErr } = await db
      .from('orders')
      .select('id, customer_email, customer_name, order_number, status, delivered_at')
      .in('status', ['DELIVERED', 'FEEDBACK'])
      .gte('delivered_at', inviteFloor)
      .lte('delivered_at', inviteCeil);
    if (candErr) throw candErr;

    // Which of these already have an invite? (one round-trip, then filter in memory)
    const candidateIds = (candidates ?? []).map((o: any) => o.id);
    const alreadyInvited = new Set<number>();
    if (candidateIds.length) {
      const { data: existing } = await db
        .from('review_invitations')
        .select('order_id')
        .in('order_id', candidateIds);
      for (const r of existing ?? []) alreadyInvited.add(r.order_id);
    }

    let invitesSent = 0;
    for (const o of candidates ?? []) {
      if (alreadyInvited.has(o.id)) continue;
      if (!o.customer_email || isOptedOut(o.customer_email)) continue;

      // Claim FIRST (at-most-once): the UNIQUE(order_id) insert reserves this order so a
      // duplicate/concurrent run can't double-ask. Only then do we send. A rare send
      // failure means this customer is silently skipped — acceptable for a review ask,
      // and far better than risking a second ask (compliance).
      const { error: insErr } = await db.from('review_invitations').insert({
        order_id: o.id,
        customer_email: o.customer_email,
        status: 'invited',
      });
      if (insErr) continue; // someone else claimed it (unique violation) — skip

      const ok = await sendEmail(o.customer_email, 'CUSTOMER_REVIEW_INVITE', {
        customer_name: o.customer_name || '',
        order_number: o.order_number || '',
      });
      invitesSent += ok ? 1 : 0;

      await db.from('order_communications').insert({
        order_id: o.id,
        recipient_email: o.customer_email,
        template_id: 'CUSTOMER_REVIEW_INVITE',
        subject: ok ? 'Review invite sent' : 'FAILED: Review invite',
        body: ok ? 'Trustpilot review invitation (MASTER v3)' : 'send-email returned non-OK',
        visibility: 'internal',
      });
    }

    // ── 2) REMINDERS (one, ever) ────────────────────────────────────────────
    const { data: dueReminders, error: remErr } = await db
      .from('review_invitations')
      .select('id, order_id, customer_email')
      .is('reminder_sent_at', null)
      .eq('status', 'invited')
      .lte('invite_sent_at', reminderCeil);
    if (remErr) throw remErr;

    // Pull the matching orders for name/number personalization.
    const reminderOrderIds = (dueReminders ?? []).map((r: any) => r.order_id);
    const ordersById: Record<number, any> = {};
    if (reminderOrderIds.length) {
      const { data: ords } = await db
        .from('orders')
        .select('id, customer_name, order_number')
        .in('id', reminderOrderIds);
      for (const o of ords ?? []) ordersById[o.id] = o;
    }

    let remindersSent = 0;
    for (const r of dueReminders ?? []) {
      if (!r.customer_email || isOptedOut(r.customer_email)) {
        // Opted out since the invite — close it out without sending.
        await db.from('review_invitations')
          .update({ reminder_sent_at: new Date().toISOString(), status: 'reminded' })
          .eq('id', r.id).is('reminder_sent_at', null);
        continue;
      }

      // Claim the reminder FIRST (at-most-once), then send.
      const { data: claimed, error: claimErr } = await db
        .from('review_invitations')
        .update({ reminder_sent_at: new Date().toISOString(), status: 'reminded' })
        .eq('id', r.id)
        .is('reminder_sent_at', null)
        .select('id');
      if (claimErr || !claimed || claimed.length === 0) continue; // already reminded by a concurrent run

      const o = ordersById[r.order_id] || {};
      const ok = await sendEmail(r.customer_email, 'CUSTOMER_REVIEW_REMINDER', {
        customer_name: o.customer_name || '',
        order_number: o.order_number || '',
      });
      remindersSent += ok ? 1 : 0;

      await db.from('order_communications').insert({
        order_id: r.order_id,
        recipient_email: r.customer_email,
        template_id: 'CUSTOMER_REVIEW_REMINDER',
        subject: ok ? 'Review reminder sent' : 'FAILED: Review reminder',
        body: ok ? 'Trustpilot review reminder (MASTER v3, one-time)' : 'send-email returned non-OK',
        visibility: 'internal',
      });
    }

    const summary = { invitesSent, remindersSent, ranAt: new Date().toISOString() };
    console.log('[review-invite-cron]', JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[review-invite-cron] error:', err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
