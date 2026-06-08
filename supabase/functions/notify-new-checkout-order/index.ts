// supabase/functions/notify-new-checkout-order/index.ts
// ✅ Database Webhook: Fires on INSERT OR UPDATE of orders table (deployed as slug "super-handler")
// Purpose: Send the INTERNAL production-team email for payment-form / checkout orders
//          (sales_agent = hello@pandapatches.com) — but ONLY once the order has full
//          details + a mockup, so production never gets an incomplete order.
//
// Gating:
//   - Only checkout orders (sales_agent in CHECKOUT_AGENTS).
//   - Only if production_notified_at IS NULL (never sent before).
//   - Only if the order is "complete enough": patch type + backing + size + ≥1 mockup/reference.
//   When all hold → send production email, then stamp production_notified_at so it fires exactly once.
//
// On INSERT: also fire the customer portal invite (once).
// On UPDATE: only the production-email release logic runs (no duplicate invite).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

// ✅ Production team emails (same as orderService.ts)
const PRODUCTION_MANAGER_EMAILS = [
  'lilcustomerzdesign@gmail.com',
  'lilcustomize550@gmail.com',
  'pandaproductionoffice@gmail.com',
];

const PVC_VENDOR_EMAIL = 'Arsalan.ali.khan.85@gmail.com';
const DESIGN_TEAM_CC = 'design@pandapatches.com';
const HELLO_EMAIL = 'hello@pandapatches.com';

// ✅ Only trigger for orders created by the checkout / payment-form system
const CHECKOUT_AGENTS = ['web_checkout', 'hello@pandapatches.com'];

function getInternalEmails(patchType?: string): string[] {
  if (patchType?.toLowerCase() === 'pvc') {
    return [PVC_VENDOR_EMAIL];
  }
  return PRODUCTION_MANAGER_EMAILS;
}

// ── Completeness gate ──────────────────────────────────────────────────────────
// An order is "ready for production" only when it has the essentials a designer needs.
function isReadyForProduction(record: any): { ready: boolean; missing: string[] } {
  const missing: string[] = [];

  const patchType = (record.patches_type || '').trim();
  // Treat the payment-form placeholder as "not set"
  if (!patchType || patchType.toLowerCase().includes('customer selects')) missing.push('patch type');

  if (!(record.design_backing || '').trim()) missing.push('backing');
  if (!(record.design_size || '').trim()) missing.push('size');

  const mockups = Array.isArray(record.mockup_urls) ? record.mockup_urls : [];
  const refs    = Array.isArray(record.customer_attachment_urls) ? record.customer_attachment_urls : [];
  if (mockups.length === 0 && refs.length === 0) missing.push('mockup/reference image');

  return { ready: missing.length === 0, missing };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();

    // Supabase database webhooks send: { type, table, record, schema, old_record }
    const record = payload.record;
    const eventType = payload.type; // 'INSERT' | 'UPDATE' | 'DELETE'

    if (!record) {
      console.log('⚠️ No record in webhook payload, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'no record' }), { status: 200 });
    }

    const salesAgent = record.sales_agent || '';
    const orderNumber = record.order_number || 'N/A';
    const isInsert = eventType === 'INSERT';

    console.log(`📧 [Checkout Webhook] ${eventType} order: ${orderNumber}, agent: ${salesAgent}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    // NOTE: The CUSTOMER "Payment Received" email is intentionally NOT sent here.
    // It must fire ONLY on a real gateway payment, so it lives inside the payment webhooks
    // (square-payment-webhook / stripe-balance-webhook) — never on agent-created orders.

    // ✅ Internal production email path is checkout-only (web_checkout or hello@pandapatches.com)
    if (!CHECKOUT_AGENTS.includes(salesAgent.toLowerCase())) {
      console.log(`⏭️ Skipping internal production email - not a checkout order (agent: ${salesAgent})`);
      return new Response(JSON.stringify({ skipped: true, reason: 'not a checkout order', customerEmailHandled: true }), { status: 200 });
    }

    // ── Customer portal invite — fire once on INSERT (independent of production readiness) ──
    if (isInsert && record.customer_email) {
      fetch(`${SUPABASE_URL}/functions/v1/invite-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          email: record.customer_email,
          customer_name: record.customer_name || 'Customer',
          order_number: orderNumber,
        }),
      })
        .then((r) => r.text())
        .then((t) => console.log(`[Checkout Webhook] invite-customer response:`, t))
        .catch((err) => console.error(`[Checkout Webhook] invite-customer failed:`, err));
    }

    // ── Production email: send exactly once, only when the order is complete ──
    if (record.production_notified_at) {
      console.log(`⏭️ Production email already sent for ${orderNumber} (${record.production_notified_at}), skipping`);
      return new Response(JSON.stringify({ skipped: true, reason: 'already notified', invited: isInsert }), { status: 200 });
    }

    const { ready, missing } = isReadyForProduction(record);
    if (!ready) {
      console.log(`⏳ Order ${orderNumber} not ready for production — missing: ${missing.join(', ')}. Holding email.`);
      return new Response(JSON.stringify({ skipped: true, reason: 'incomplete', missing, invited: isInsert }), { status: 200 });
    }

    // ✅ Complete → build + send the internal production email
    const patchType = record.patches_type || '';
    const internalEmails = getInternalEmails(patchType);
    const primaryRecipient = internalEmails[0];
    const ccEmails = [
      DESIGN_TEAM_CC,
      ...internalEmails.slice(1),
      HELLO_EMAIL,
    ].filter(Boolean).join(',');

    const dynamicData = {
      customer_name: record.customer_name || 'Unknown Customer',
      order_number: orderNumber,
      order_date: record.created_at ? new Date(record.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
      design_name: record.design_name || '',
      quantity: record.patches_quantity || '',
      patch_type: patchType,
      backing: record.design_backing || '',
      size: record.design_size || '',
      border_type: record.border_type || '',
      instructions: record.instructions || '',
      shipping_address: record.shipping_address || '',
      order_link: `https://portal.pandapatches.com/order/${orderNumber}`,
      sales_agent_name: HELLO_EMAIL,
      is_urgent: record.is_urgent || false,
      rush_date: record.rush_date ? new Date(record.rush_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : null,
      has_winner: false,
      has_gallery: false,
      winner_file: null,
      gallery_files: [],
    };

    console.log(`📧 [Checkout Webhook] Order ${orderNumber} complete — sending INTERNAL_NEW_ORDER to: ${primaryRecipient}, CC: ${ccEmails}`);

    const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: primaryRecipient,
        template_id: 'INTERNAL_NEW_ORDER',
        dynamic_data: dynamicData,
        cc: ccEmails,
      }),
    });

    const emailResult = await emailResponse.text();
    if (!emailResponse.ok) {
      console.error(`❌ [Checkout Webhook] Email send failed:`, emailResult);
      return new Response(JSON.stringify({ success: false, error: emailResult }), { status: 500 });
    }

    // ✅ Stamp production_notified_at so this fires exactly once.
    // Guard the update on production_notified_at IS NULL to avoid a race double-send.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: stampErr } = await admin
      .from('orders')
      .update({ production_notified_at: new Date().toISOString() })
      .eq('id', record.id)
      .is('production_notified_at', null);
    if (stampErr) {
      console.error(`⚠️ [Checkout Webhook] Failed to stamp production_notified_at for ${orderNumber}:`, stampErr);
      // Email already sent; not fatal, but log so we can investigate a possible duplicate risk.
    }

    console.log(`✅ [Checkout Webhook] Production email sent + stamped for order ${orderNumber}`);

    return new Response(
      JSON.stringify({ success: true, order: orderNumber, sent_to: primaryRecipient, cc: ccEmails, invited: isInsert }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('❌ [Checkout Webhook] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
