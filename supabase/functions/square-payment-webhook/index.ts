// supabase/functions/square-payment-webhook/index.ts
// Receives Square payment.updated webhook events.
//
// Two flows:
//   A) Token-based (payment form): reference_id is a UUID token
//      → create new order from payment_form_tokens data + attribution
//      → mark token as used
//   B) Order-based (existing order): reference_id is PP-XXXXX or numeric order id
//      → update orders.amount_paid
//
// In both cases, fire_capi_purchase_on_paid Postgres trigger fires CAPI Purchase automatically.
//
// Security: JWT verification DISABLED — Square can't send Supabase JWT.
// Auth via HMAC-SHA256: base64(HMAC-SHA256(sigKey, webhookUrl + rawBody))
// Square header: x-square-hmacsha256-signature

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const WEBHOOK_URL = 'https://uxgzlneefybifvccfhwp.supabase.co/functions/v1/square-payment-webhook';
const enc = new TextEncoder();

async function verifySquareSignature(rawBody: string, sigHeader: string, sigKey: string): Promise<boolean> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', enc.encode(sigKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig      = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(WEBHOOK_URL + rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    if (expected.length !== sigHeader.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sigHeader.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

// UUID format check — token-based flow
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Derive the REAL marketing lead source from attribution (utm_source → referrer).
// sales_agent stays WEB_CHECKOUT (we know they self-paid); lead_source = where they came FROM.
// Falls back to 'Checkout' only when no attribution signal exists.
function resolveLeadSource(attribution: any): string {
  const utm = (attribution?.utm_source || '').toString().toLowerCase();
  const utmMap: Record<string, string> = {
    facebook: 'Facebook', fb: 'Facebook', instagram: 'Instagram', ig: 'Instagram',
    google: 'Google', bing: 'Bing', tiktok: 'TikTok', youtube: 'YouTube',
    linkedin: 'LinkedIn', twitter: 'Twitter', reddit: 'Reddit', snapchat: 'Snapchat',
    email: 'Email', newsletter: 'Email', 'chatgpt.com': 'ChatGPT', chatgpt: 'ChatGPT',
    perplexity: 'Perplexity', claude: 'Claude', gemini: 'Gemini', copilot: 'Copilot',
  };
  if (utm && utmMap[utm]) return utmMap[utm];

  const ref = (attribution?.referrer || attribution?.page_url || '').toString();
  const refRules: Array<[RegExp, string]> = [
    [/chat\.?openai\.com|chatgpt\.com/i, 'ChatGPT'], [/perplexity\.ai/i, 'Perplexity'],
    [/claude\.ai|anthropic\.com/i, 'Claude'], [/gemini\.google\.com|bard\.google/i, 'Gemini'],
    [/copilot\.microsoft|bing\.com\/chat/i, 'Copilot'],
    [/facebook\.com|fb\.com|m\.facebook/i, 'Facebook'], [/instagram\.com/i, 'Instagram'],
    [/tiktok\.com/i, 'TikTok'], [/youtube\.com|youtu\.be/i, 'YouTube'],
    [/linkedin\.com|lnkd\.in/i, 'LinkedIn'], [/twitter\.com|x\.com|t\.co/i, 'Twitter'],
    [/reddit\.com/i, 'Reddit'], [/snapchat\.com/i, 'Snapchat'],
    [/google\.[a-z.]+/i, 'Google'], [/bing\.com/i, 'Bing'],
    [/whatsapp\.com|wa\.me/i, 'WhatsApp'],
  ];
  for (const [re, label] of refRules) if (re.test(ref)) return label;

  // utm_source present but unmapped → use it raw (capitalized); else Checkout
  if (utm) return utm.charAt(0).toUpperCase() + utm.slice(1);
  return 'Checkout';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const SIG_KEY      = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') ?? '';
    const SQUARE_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!SIG_KEY) throw new Error('SQUARE_WEBHOOK_SIGNATURE_KEY not configured');

    const rawBody   = await req.text();
    const sigHeader = req.headers.get('x-square-hmacsha256-signature') ?? '';

    if (!sigHeader) {
      console.error('[square-payment-webhook] missing x-square-hmacsha256-signature header');
      return new Response('Missing signature', { status: 400 });
    }

    const valid = await verifySquareSignature(rawBody, sigHeader, SIG_KEY);
    if (!valid) {
      console.error('[square-payment-webhook] signature verification failed');
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Idempotency ──────────────────────────────────────────────────────────
    const { error: dedupErr } = await admin
      .from('square_webhook_events')
      .insert({ event_id: event.event_id, event_type: event.type });
    if (dedupErr) {
      if ((dedupErr as any).code === '23505') {
        console.log(`[square-payment-webhook] duplicate event ${event.event_id} ignored`);
        return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 });
      }
      console.error('[square-payment-webhook] dedup insert failed:', dedupErr);
    }

    if (event.type !== 'payment.updated') {
      return new Response(JSON.stringify({ received: true, type: event.type }), { status: 200 });
    }

    const payment = event?.data?.object?.payment;
    if (!payment) return new Response(JSON.stringify({ received: true, skipped: 'no payment object' }), { status: 200 });
    if (payment.status !== 'COMPLETED') {
      console.log(`[square-payment-webhook] payment ${payment.id} status=${payment.status}, skipping`);
      return new Response(JSON.stringify({ received: true, skipped: `status=${payment.status}` }), { status: 200 });
    }

    // Cents → dollars
    const paidAmount  = (payment.amount_money?.amount ?? 0) / 100;

    // Resolve OUR token. Square Payment Links do NOT copy the order's reference_id onto the
    // payment object, so payment.reference_id is almost always empty here (this is why orders
    // were never being created). We DO set the token on the Square ORDER (reference_id +
    // metadata.token) in create-square-checkout, so fall back to fetching the order by
    // payment.order_id and reading the token from there.
    let referenceId = payment.reference_id || '';
    if (!referenceId && payment.order_id && SQUARE_TOKEN) {
      try {
        const orderRes = await fetch(`https://connect.squareup.com/v2/orders/${payment.order_id}`, {
          headers: { 'Authorization': `Bearer ${SQUARE_TOKEN}`, 'Square-Version': '2025-05-21' },
        });
        const orderJson = await orderRes.json();
        referenceId = orderJson?.order?.reference_id || orderJson?.order?.metadata?.token || '';
        console.log(`[square-payment-webhook] resolved reference_id from Square order ${payment.order_id}: ${referenceId || '(none)'}`);
      } catch (e) {
        console.error('[square-payment-webhook] failed to fetch Square order for reference_id:', e);
      }
    }

    if (!referenceId) {
      console.warn('[square-payment-webhook] no reference_id on payment or order', payment.id);
      return new Response(JSON.stringify({ received: true, skipped: 'no reference_id' }), { status: 200 });
    }

    // ── FLOW A: Token-based (UUID) → create new order ────────────────────────
    if (isUUID(referenceId)) {
      const { data: tokenRow, error: tokenErr } = await admin
        .from('payment_form_tokens')
        .select('*')
        .eq('token', referenceId)
        .single();

      if (tokenErr || !tokenRow) {
        console.error(`[square-payment-webhook] token ${referenceId} not found`);
        return new Response(JSON.stringify({ received: true, error: 'token not found' }), { status: 200 });
      }

      if (tokenRow.used_at) {
        console.log(`[square-payment-webhook] token ${referenceId} already used, skipping`);
        return new Response(JSON.stringify({ received: true, skipped: 'token already used' }), { status: 200 });
      }

      // Merge attribution from token (captured on page load) with payment metadata
      const meta = payment.note || '';
      const attribution = {
        ...(tokenRow.attribution || {}),
        source: tokenRow.attribution?.source || 'square_payment_form',
        payment_type: payment.reference_id,
      };

      // Get full order amount from token metadata
      const orderAmount = tokenRow.order_amount || paidAmount;

      // Deposit orders: stamp a marker on the instructions so staff know to collect the balance.
      const depositNote = tokenRow.is_deposit
        ? `[DEPOSIT — $${paidAmount.toFixed(2)} paid; remaining balance to collect separately]`
        : '';
      const orderInstructions = [depositNote, tokenRow.instructions]
        .filter((s) => s && String(s).trim())
        .join('\n') || null;

      // Create order — trigger fires CAPI Purchase automatically
      const { data: newOrder, error: orderErr } = await admin
        .from('orders')
        .insert({
          customer_name:    tokenRow.customer_name,
          customer_email:   tokenRow.customer_email,
          customer_phone:   tokenRow.customer_phone   || null,
          design_name:      tokenRow.design_name      || null,
          patches_type:     tokenRow.patches_type     || null,
          patches_quantity: tokenRow.patches_quantity || 0,
          design_size:      tokenRow.design_size      || null,
          design_backing:   tokenRow.design_backing   || null,
          instructions:     orderInstructions,
          mockup_urls:      Array.isArray(tokenRow.mockup_urls) ? tokenRow.mockup_urls : [],
          order_amount:     orderAmount,
          amount_paid:      paidAmount,
          // amount_remaining is NOT a real column (derived on the frontend) — inserting it errors.
          production_cost:  0,
          shipping_cost:    0,
          marketing_cost:   0,
          sales_agent:      tokenRow.created_by,
          lead_source:      resolveLeadSource(attribution),
          attribution,
          is_urgent:        false,
          status:           'NEW_ORDER',
        })
        .select('id, order_number')
        .single();

      if (orderErr || !newOrder) {
        console.error(`[square-payment-webhook] failed to create order from token ${referenceId}:`, orderErr);
        return new Response(JSON.stringify({ received: true, error: 'order creation failed' }), { status: 200 });
      }

      // Log order creation
      await admin.from('order_history').insert({
        order_id:      newOrder.id,
        user_email:    'square_webhook',
        field_changed: 'ORDER_CREATED',
        old_value:     null,
        new_value:     `Created from Payment Form (token: ${referenceId}) via Square payment $${paidAmount}`,
      }).catch(() => {});

      // Mark token as used
      await admin.from('payment_form_tokens').update({
        used_at:      new Date().toISOString(),
        order_id:     newOrder.id,
        order_number: newOrder.order_number,
      }).eq('token', referenceId);

      // ── CUSTOMER "Payment Received" email — real gateway payment confirmed ──
      // Fires here (and ONLY here / in stripe-balance-webhook) so it never sends for
      // agent-created or manually-collected orders. Guarded by customer_confirmation_sent_at.
      if (tokenRow.customer_email) {
        try {
          const { data: custStamped } = await admin
            .from('orders')
            .update({ customer_confirmation_sent_at: new Date().toISOString() })
            .eq('id', newOrder.id)
            .is('customer_confirmation_sent_at', null)
            .select('id');
          if (custStamped && custStamped.length > 0) {
            await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
              body: JSON.stringify({
                to: tokenRow.customer_email,
                template_id: 'CUSTOMER_PAYMENT_CONFIRMATION',
                dynamic_data: {
                  customer_name: tokenRow.customer_name || 'there',
                  order_number: newOrder.order_number,
                  amount_paid: `$${paidAmount.toFixed(2)}`,
                  total_amount: `$${(orderAmount || paidAmount).toFixed(2)}`,
                  portal_action_url: 'https://pandapatches.com/login',
                },
              }),
            });
            console.log(`[square-payment-webhook] customer payment-confirmation email sent for ${newOrder.order_number}`);
          }
        } catch (custErr) {
          console.error(`[square-payment-webhook] customer email failed for ${newOrder.order_number}:`, custErr);
        }
      }

      // Notify staff in-app via activity_notifications (one row per recipient).
      // Recipients = all admins (payment-form orders have sales_agent = hello@pandapatches.com).
      try {
        const { data: admins } = await admin
          .from('user_profiles')
          .select('id')
          .eq('role', 'ADMIN');
        // type must be one of the activity_notifications CHECK values; 'order_paid' fits a paid payment-form order.
        const notifRows = (admins || []).map((a: { id: string }) => ({
          recipient_id:     a.id,
          type:             'order_paid',
          title:            `New order ${newOrder.order_number} via Payment Form`,
          body:             `$${paidAmount} paid by ${tokenRow.customer_name || tokenRow.customer_email}`,
          link:             `/order/${newOrder.order_number}`,
          related_order_id: newOrder.id,
        }));
        if (notifRows.length > 0) {
          await admin.from('activity_notifications').insert(notifRows);
        }
      } catch (notifErr) {
        console.error(`[square-payment-webhook] activity_notifications insert failed for ${newOrder.order_number}:`, notifErr);
      }

      console.log(`[square-payment-webhook] token ${referenceId} → order ${newOrder.order_number}: $${paidAmount} paid, CAPI queued`);

      return new Response(
        JSON.stringify({ received: true, order_number: newOrder.order_number, paid: paidAmount }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── FLOW B: Existing order (PP-XXXXX or numeric id) ──────────────────────
    const isOrderNumber = referenceId.startsWith('PP-');
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_number, amount_paid, order_amount, attribution')
      .eq(isOrderNumber ? 'order_number' : 'id', isOrderNumber ? referenceId : parseInt(referenceId, 10))
      .single();

    if (orderErr || !order) {
      console.error(`[square-payment-webhook] order not found for reference_id=${referenceId}:`, orderErr);
      return new Response(JSON.stringify({ received: true, error: 'order not found' }), { status: 200 });
    }

    const newAmountPaid  = (order.amount_paid || 0) + paidAmount;
    const updatePayload: any = { amount_paid: newAmountPaid };
    const existingAttr   = order.attribution || {};
    if (!existingAttr.source) {
      updatePayload.attribution = { ...existingAttr, source: 'square_payment' };
    }

    const { error: updateErr } = await admin.from('orders').update(updatePayload).eq('id', order.id);
    if (updateErr) {
      console.error(`[square-payment-webhook] failed to update order ${order.order_number}:`, updateErr);
      return new Response(JSON.stringify({ received: true, error: updateErr.message }), { status: 200 });
    }

    await admin.from('order_history').insert({
      order_id: order.id, user_email: 'square_webhook',
      field_changed: 'amount_paid',
      old_value: String(order.amount_paid || 0), new_value: String(newAmountPaid),
    }).catch(() => {});

    console.log(`[square-payment-webhook] order ${order.order_number}: +$${paidAmount} → $${newAmountPaid}/${order.order_amount}`);

    return new Response(
      JSON.stringify({ received: true, order_number: order.order_number, paid: paidAmount, new_amount_paid: newAmountPaid }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[square-payment-webhook] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
