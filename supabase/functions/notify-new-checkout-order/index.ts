// supabase/functions/notify-new-checkout-order/index.ts
// ✅ Database Webhook: Fires on INSERT into orders table
// Purpose: Send internal production team email for checkout orders (salesAgent = hello@pandapatches.com)
// These orders come from Stripe/PayPal checkout and bypass the CRM's createOrder flow

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ✅ Production team emails (same as orderService.ts)
const PRODUCTION_MANAGER_EMAILS = [
  'lilcustomerzdesign@gmail.com',
  'lilcustomize550@gmail.com',
  'pandaproductionoffice@gmail.com',
];

const PVC_VENDOR_EMAIL = 'Arsalan.ali.khan.85@gmail.com';
const DESIGN_TEAM_CC = 'design@pandapatches.com';
const HELLO_EMAIL = 'hello@pandapatches.com';

// ✅ Only trigger for orders created by the checkout system
const CHECKOUT_AGENTS = ['web_checkout', 'hello@pandapatches.com'];

function getInternalEmails(patchType?: string): string[] {
  if (patchType?.toLowerCase() === 'pvc') {
    return [PVC_VENDOR_EMAIL];
  }
  return PRODUCTION_MANAGER_EMAILS;
}

serve(async (req) => {
  // Database webhooks send POST requests with the new row data
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  try {
    const payload = await req.json();

    // Supabase database webhooks send: { type, table, record, schema, old_record }
    const record = payload.record;

    if (!record) {
      console.log('⚠️ No record in webhook payload, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'no record' }), { status: 200 });
    }

    const salesAgent = record.sales_agent || '';
    const orderNumber = record.order_number || 'N/A';

    console.log(`📧 [Checkout Webhook] New order: ${orderNumber}, agent: ${salesAgent}`);

    // ✅ Only fire for checkout orders (WEB_CHECKOUT or hello@pandapatches.com)
    if (!CHECKOUT_AGENTS.includes(salesAgent.toLowerCase())) {
      console.log(`⏭️ Skipping - order created by CRM agent: ${salesAgent} (not checkout)`);
      return new Response(JSON.stringify({ skipped: true, reason: 'not a checkout order' }), { status: 200 });
    }

    // ✅ Get the right production team based on patch type
    const patchType = record.patches_type || '';
    const internalEmails = getInternalEmails(patchType);
    const primaryRecipient = internalEmails[0];
    const ccEmails = [
      DESIGN_TEAM_CC,
      ...internalEmails.slice(1),
      HELLO_EMAIL,
    ].filter(Boolean).join(',');

    // ✅ Build email data — NO PRICING INFO for internal production emails
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

      // ✅ No price fields — production team doesn't need pricing
      // winner_file, gallery_files not available at order creation from checkout
      has_winner: false,
      has_gallery: false,
      winner_file: null,
      gallery_files: [],
    };

    console.log(`📧 [Checkout Webhook] Sending INTERNAL_NEW_ORDER to: ${primaryRecipient}, CC: ${ccEmails}`);

    // ✅ Call the existing send-email Edge Function
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

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

    console.log(`✅ [Checkout Webhook] Internal production email sent for order ${orderNumber}`);

    return new Response(
      JSON.stringify({ success: true, order: orderNumber, sent_to: primaryRecipient, cc: ccEmails }),
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
