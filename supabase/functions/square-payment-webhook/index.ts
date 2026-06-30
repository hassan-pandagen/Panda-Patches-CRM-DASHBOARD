// supabase/functions/square-payment-webhook/index.ts
// Receives Square payment.updated webhook events.
//
// Two flows:
//   A) Token-based (payment form): reference_id is a UUID token
//      -> create new order from payment_form_tokens data + attribution
//      -> mark token as used
//   B) Order-based (existing order): reference_id is PP-XXXXX or numeric order id
//      -> update orders.amount_paid
//
// Idempotency is at the PAYMENT level: Square emits MULTIPLE payment.updated events (each with its
// own event_id) for the SAME payment, so per-event_id dedup is not enough — we claim payment.id once.
//
// Security: JWT verification DISABLED. Auth via HMAC-SHA256 of (webhookUrl + rawBody).

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

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Resolve the real "where did this lead come from?" label from the attribution blob.
// MUST stay in sync with src/utils/leadSource.ts -> detectLeadSource (same precedence,
// same maps). NOTE: 'Checkout' is NOT a lead source — it's the channel (sales_agent =
// 'WEB_CHECKOUT'). When no source can be detected we fall back to 'Direct', never 'Checkout'.
function resolveLeadSource(attribution: any): string {
  const attr = attribution ?? {};

  const utmMedium = String(attr.utm_medium ?? '').toLowerCase().trim();
  const utmSrc    = String(attr.utm_source ?? '').toLowerCase().trim();
  const isPaidMedium = ['paid', 'cpc', 'ppc', 'paid_social', 'paidsocial'].includes(utmMedium);

  // 0. Definitive paid-ad signals (ad click straight off Meta, or website's paid flag)
  if (attr.ad_id || attr.ads_context || /^ads?$/i.test(String(attr.referral_source ?? '').trim())) return 'Facebook Ad';
  if (isPaidMedium) {
    if (/^(fb|facebook|ig|instagram|meta)/.test(utmSrc)) return 'Facebook Ad';
    if (/^(google|adwords|gads?)/.test(utmSrc))          return 'Google Ad';
    if (/^(bing|microsoft|msn)/.test(utmSrc))            return 'Bing Ad';
    if (/^(tiktok|tt)/.test(utmSrc))                     return 'TikTok Ad';
  }

  // 1. Paid ad click IDs — came from a specific ad
  if (attr.fbclid)  return 'Facebook Ad';
  if (attr.gclid)   return 'Google Ad';
  if (attr.msclkid) return 'Bing Ad';
  if (attr.ttclid)  return 'TikTok Ad';

  // Meta-chat sources (conversations merge)
  if (attr.source === 'meta_messenger') return 'Facebook';
  if (attr.source === 'meta_instagram') return 'Instagram';

  const UTM_MAP: Record<string, string> = {
    facebook: 'Facebook', fb: 'Facebook', instagram: 'Instagram', ig: 'Instagram',
    google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', ddg: 'DuckDuckGo', brave: 'Brave',
    tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', twitter: 'Twitter',
    reddit: 'Reddit', snapchat: 'Snapchat', email: 'Email', newsletter: 'Email', whatsapp: 'WhatsApp',
    chatgpt: 'ChatGPT', 'chatgpt.com': 'ChatGPT', perplexity: 'Perplexity', claude: 'Claude',
    gemini: 'Gemini', copilot: 'Copilot', metaai: 'Meta AI', 'meta.ai': 'Meta AI', deepseek: 'DeepSeek',
  };
  const REFERRER_MAP: Array<[RegExp, string]> = [
    [/chat\.?openai\.com|chatgpt\.com/i, 'ChatGPT'], [/perplexity\.ai/i, 'Perplexity'],
    [/claude\.ai|anthropic\.com/i, 'Claude'], [/gemini\.google\.com|bard\.google\.com/i, 'Gemini'],
    [/copilot\.microsoft\.com|bing\.com\/chat/i, 'Copilot'], [/meta\.ai/i, 'Meta AI'], [/deepseek\.com/i, 'DeepSeek'],
    [/facebook\.com|fb\.com|m\.facebook/i, 'Facebook'], [/instagram\.com/i, 'Instagram'],
    [/tiktok\.com/i, 'TikTok'], [/youtube\.com|youtu\.be/i, 'YouTube'],
    [/linkedin\.com|lnkd\.in/i, 'LinkedIn'], [/twitter\.com|x\.com|t\.co/i, 'Twitter'],
    [/reddit\.com/i, 'Reddit'], [/snapchat\.com/i, 'Snapchat'],
    [/google\.[a-z.]+/i, 'Google'], [/bing\.com/i, 'Bing'],
    [/duckduckgo\.com|duck\.com/i, 'DuckDuckGo'], [/search\.brave\.com/i, 'Brave'],
    [/whatsapp\.com|wa\.me/i, 'WhatsApp'], [/tawk\.to/i, 'Tawk.to'],
    [/mail\.google\.com|outlook\.live|outlook\.office/i, 'Email'],
  ];

  // 2. utm_source (bare token or full domain)
  if (utmSrc) {
    if (UTM_MAP[utmSrc]) return UTM_MAP[utmSrc];
    for (const [re, label] of REFERRER_MAP) if (re.test(utmSrc)) return label;
  }

  // 3. Referrer hostname → organic/social/AI search
  const referrer = String(attr.referrer ?? attr.http_referer ?? '').toLowerCase();
  if (referrer) {
    for (const [re, label] of REFERRER_MAP) if (re.test(referrer)) return label;
  }

  // 4. No detectable source — it's "Direct", NOT "Checkout" (channel lives in sales_agent)
  return 'Direct';
}

// --- Normalize storefront vocabulary to canonical CRM dropdown values ---------------
// The website posts its own product/backing names ("Custom PVC Patches", "velcro",
// "iron-on") that don't match the CRM order form's <select> options, so they render
// blank in the editor. Map them to canonical values at insert so NEW orders match.
// Mirrors PATCHES_TYPE_OPTIONS (constants/options.ts) and the form's backingOptions.
// Unknown values pass through unchanged so we never drop data.
const PATCH_TYPE_CANON = [
  'Embroidered', 'PVC', 'Woven', 'Chenille', 'Leather', '3D Embroidery Puff', '3D Embroidery Transfer',
  'Chenille Transfer', 'Sequin Patch', 'Sublimation Patch', 'Sublimation+Embroidery', 'DTF Transfer',
  'Silicone Transfer', 'High Density Transfer', 'TPU+Chenille', 'TPU+Embroidery', 'TPU+Sublimation',
  'Glitter+Embroidery', 'Glitter+Chenille', 'Glitter+Embroidery 3D', 'DTF+Chenille', 'DTF+Embroidery',
  'Embroidery Transfer', 'DST Service', 'Challenge Coin', 'PVC Keychains', 'Embroidered Keychains',
  'Leather Keychains', 'Sample Box', 'Customize Sample Box',
];
const PATCH_TYPE_ALIAS: Record<string, string> = {
  customembroideredpatches: 'Embroidered', embroideredpatches: 'Embroidered',
  '3dembroidered': '3D Embroidery Puff', custom3dembroideredtransfer: '3D Embroidery Transfer',
  custompvcpatches: 'PVC', customwovenpatches: 'Woven', customchenillepatches: 'Chenille',
  customleatherpatches: 'Leather', customsublimationpatches: 'Sublimation Patch',
  silicone: 'Silicone Transfer', customsiliconelabels: 'Silicone Transfer',
  sequin: 'Sequin Patch', customsequinpatches: 'Sequin Patch',
  chenilletpu: 'TPU+Chenille', customchenilletpupatches: 'TPU+Chenille',
  chenilleglitter: 'Glitter+Chenille', customchenilleglitterpatches: 'Glitter+Chenille',
  pvckeychain: 'PVC Keychains', embroideredkeychain: 'Embroidered Keychains',
};
const BACKING_CANON = ['Iron on', 'Sew on', 'Sticker', 'Velcro'];
const BACKING_ALIAS: Record<string, string> = {
  iron: 'Iron on', justheatpress: 'Iron on', heatpress: 'Iron on',
  sew: 'Sew on',
  stickerbacking: 'Sticker', adhesive: 'Sticker',
};

const normKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function canonicalize(value: unknown, canon: string[], alias: Record<string, string>): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const key = normKey(raw);
  const exact = canon.find((c) => normKey(c) === key); // case/spacing-insensitive match
  if (exact) return exact;
  if (alias[key]) return alias[key];
  return raw; // unknown -> keep original rather than dropping the value
}

const normalizePatchType = (v: unknown) => canonicalize(v, PATCH_TYPE_CANON, PATCH_TYPE_ALIAS);
const normalizeBacking = (v: unknown) => canonicalize(v, BACKING_CANON, BACKING_ALIAS);

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
      console.error('[square-payment-webhook] missing signature header');
      return new Response('Missing signature', { status: 400 });
    }

    const valid = await verifySquareSignature(rawBody, sigHeader, SIG_KEY);
    if (!valid) {
      console.error('[square-payment-webhook] signature verification failed');
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Idempotency (per webhook delivery) — catches literal retries of the SAME event_id.
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

    const paidAmount  = (payment.amount_money?.amount ?? 0) / 100;

    // PAYMENT-LEVEL idempotency. Square emits MULTIPLE payment.updated events (each a distinct
    // event_id) for the SAME payment as the payment object changes — the per-event_id dedup above
    // does NOT catch them, which previously created duplicate orders (one per event). Claim the
    // payment.id so each real payment is handled exactly once across BOTH flows. We claim BEFORE any
    // order write so it holds even if the function is killed right after the INSERT. Released on a
    // genuine failure below so a later event can still complete the work.
    const { error: payClaimErr } = await admin
      .from('square_processed_payments')
      .insert({ payment_id: payment.id });
    if (payClaimErr) {
      if ((payClaimErr as any).code === '23505') {
        console.log(`[square-payment-webhook] payment ${payment.id} already processed, skipping`);
        return new Response(JSON.stringify({ received: true, deduped: 'payment already processed' }), { status: 200 });
      }
      // Unexpected error — fail OPEN (continue) so a DB hiccup never drops a real payment.
      console.error('[square-payment-webhook] payment claim insert failed (continuing):', payClaimErr);
    }
    const releasePayment = async () => {
      try { await admin.from('square_processed_payments').delete().eq('payment_id', payment.id); } catch (_e) { /* best-effort */ }
    };

    // Resolve OUR token. Square Payment Links do NOT copy the order's reference_id onto the payment
    // object, so payment.reference_id is almost always empty (this is why orders were never created).
    // We set the token on the Square ORDER (reference_id + metadata.token) in create-square-checkout,
    // so fall back to fetching the order by payment.order_id and reading the token from there.
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
      await releasePayment();
      return new Response(JSON.stringify({ received: true, skipped: 'no reference_id' }), { status: 200 });
    }

    // FLOW A: Token-based (UUID) -> create new order
    if (isUUID(referenceId)) {
      const { data: tokenRow, error: tokenErr } = await admin
        .from('payment_form_tokens')
        .select('*')
        .eq('token', referenceId)
        .single();

      if (tokenErr || !tokenRow) {
        console.error(`[square-payment-webhook] token ${referenceId} not found`);
        await releasePayment();
        return new Response(JSON.stringify({ received: true, error: 'token not found' }), { status: 200 });
      }

      if (tokenRow.used_at) {
        // Already converted to an order by an earlier payment for this token — nothing to do.
        console.log(`[square-payment-webhook] token ${referenceId} already used, skipping`);
        return new Response(JSON.stringify({ received: true, skipped: 'token already used' }), { status: 200 });
      }

      const attribution = {
        ...(tokenRow.attribution || {}),
        source: tokenRow.attribution?.source || 'square_payment_form',
      };

      const orderAmount = tokenRow.order_amount || paidAmount;

      // Payment context (deposit paid / remaining balance) lives in the Financials section
      // — amount_paid vs order_amount — which is visible to sales/admin ONLY. Do NOT inject
      // it into `instructions`: that field is shown to the production team (internal order
      // email, production views), who must never see payment info.
      // (memory: production-team-no-sales-payment)
      const orderInstructions = (tokenRow.instructions && String(tokenRow.instructions).trim())
        ? String(tokenRow.instructions).trim()
        : null;

      const { data: newOrder, error: orderErr } = await admin
        .from('orders')
        .insert({
          customer_name:    tokenRow.customer_name,
          customer_email:   tokenRow.customer_email,
          customer_phone:   tokenRow.customer_phone   || null,
          design_name:      tokenRow.design_name      || null,
          patches_type:     normalizePatchType(tokenRow.patches_type),
          patches_quantity: tokenRow.patches_quantity || 0,
          design_size:      tokenRow.design_size      || null,
          design_backing:   normalizeBacking(tokenRow.design_backing),
          instructions:     orderInstructions,
          mockup_urls:      Array.isArray(tokenRow.mockup_urls) ? tokenRow.mockup_urls : [],
          order_amount:     orderAmount,
          amount_paid:      paidAmount,
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
        await releasePayment();
        return new Response(JSON.stringify({ received: true, error: 'order creation failed' }), { status: 200 });
      }

      // Mark token used + link to the order. Best-effort: the payment.id claim above is the real
      // idempotency guard, so even if this update doesn't land, no duplicate order can be created.
      await admin.from('payment_form_tokens').update({
        used_at:      new Date().toISOString(),
        order_id:     newOrder.id,
        order_number: newOrder.order_number,
      }).eq('token', referenceId);

      await admin.from('square_processed_payments')
        .update({ order_number: newOrder.order_number }).eq('payment_id', payment.id);

      await admin.from('order_history').insert({
        order_id:      newOrder.id,
        user_email:    'square_webhook',
        field_changed: 'ORDER_CREATED',
        old_value:     null,
        new_value:     `Created from Payment Form (token: ${referenceId}) via Square payment $${paidAmount}`,
      }).catch(() => {});

      // CUSTOMER "Payment Received" email — guarded by customer_confirmation_sent_at (exactly once)
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

      // Notify admins in-app
      try {
        const { data: admins } = await admin
          .from('user_profiles')
          .select('id')
          .eq('role', 'ADMIN');
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

      console.log(`[square-payment-webhook] token ${referenceId} -> order ${newOrder.order_number}: $${paidAmount} paid, CAPI queued`);

      return new Response(
        JSON.stringify({ received: true, order_number: newOrder.order_number, paid: paidAmount }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // FLOW B: Existing order (PP-XXXXX or numeric id)
    const isOrderNumber = referenceId.startsWith('PP-');
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_number, amount_paid, order_amount, attribution')
      .eq(isOrderNumber ? 'order_number' : 'id', isOrderNumber ? referenceId : parseInt(referenceId, 10))
      .single();

    if (orderErr || !order) {
      console.error(`[square-payment-webhook] order not found for reference_id=${referenceId}:`, orderErr);
      await releasePayment();
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
      await releasePayment();
      return new Response(JSON.stringify({ received: true, error: updateErr.message }), { status: 200 });
    }

    await admin.from('square_processed_payments')
      .update({ order_number: order.order_number }).eq('payment_id', payment.id);

    await admin.from('order_history').insert({
      order_id: order.id, user_email: 'square_webhook',
      field_changed: 'amount_paid',
      old_value: String(order.amount_paid || 0), new_value: String(newAmountPaid),
    }).catch(() => {});

    console.log(`[square-payment-webhook] order ${order.order_number}: +$${paidAmount} -> $${newAmountPaid}/${order.order_amount}`);

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
