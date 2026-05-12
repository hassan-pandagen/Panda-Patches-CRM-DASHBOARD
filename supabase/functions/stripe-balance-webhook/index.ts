// supabase/functions/stripe-balance-webhook/index.ts
// Receives Stripe webhook events for balance payments initiated from
// the customer portal (via create-stripe-checkout). Updates orders.amount_paid,
// which automatically triggers the CAPI Purchase event via the
// fire_capi_purchase_on_paid Postgres trigger.
//
// Two layers of idempotency:
//   1. stripe_webhook_events table dedupes on event.id (Stripe retries up to 3 days)
//   2. capi_purchase_sent flag on orders table prevents duplicate CAPI fires
//
// IMPORTANT: This webhook must use raw body for Stripe signature verification.
// We do signature verification with native Web Crypto (HMAC-SHA256) — no Stripe SDK.
// SDK has had recurring import/boot issues on Supabase Edge Runtime.

// Pin to 2.49.10+ — 2.49.9 had a JSR resolution bug that caused gateway 502s on boot.
// See: https://github.com/orgs/supabase/discussions/36109
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

// ── Stripe signature verification (no SDK) ────────────────────────────────
// Stripe sends a header like:
//   stripe-signature: t=1492774577,v1=5257a869...,v0=...
// Algorithm:
//   1. Parse header into timestamp `t` and signatures `v1`
//   2. Compute HMAC-SHA256 of `${t}.${rawBody}` using your webhook secret
//   3. Compare hex result against any v1 (constant time)
//   4. Reject if timestamp is older than tolerance window (default 5 min)
const enc = new TextEncoder();

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<{ valid: boolean; reason?: string }> {
  const parts = sigHeader.split(",").map(p => p.trim());
  let timestamp: string | null = null;
  const v1Sigs: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "t") timestamp = v;
    else if (k === "v1") v1Sigs.push(v);
  }
  if (!timestamp || v1Sigs.length === 0) {
    return { valid: false, reason: "Malformed signature header" };
  }

  const ageSec = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (ageSec > toleranceSeconds) {
    return { valid: false, reason: `Timestamp too old (${ageSec}s)` };
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  for (const sig of v1Sigs) {
    if (constantTimeEqual(expected, sig)) return { valid: true };
  }
  return { valid: false, reason: "Signature mismatch" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const WEBHOOK_SECRET = Deno.env.get("STRIPE_BALANCE_WEBHOOK_SECRET") ?? "";

    if (!WEBHOOK_SECRET) throw new Error("STRIPE_BALANCE_WEBHOOK_SECRET not configured");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");

    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    const { valid, reason } = await verifyStripeSignature(rawBody, sig, WEBHOOK_SECRET);
    if (!valid) {
      console.error("[stripe-balance-webhook] signature verification failed:", reason);
      return new Response(`Webhook Error: ${reason}`, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Idempotency: dedup on event.id ───────────────────────────────────
    // Stripe retries up to 3 days. Without dedup, a single payment could double-add.
    const { error: dedupErr } = await admin
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });
    if (dedupErr) {
      if ((dedupErr as any).code === "23505") {
        console.log(`[stripe-balance-webhook] duplicate event ${event.id} ignored`);
        return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 });
      }
      console.error("[stripe-balance-webhook] dedup insert failed:", dedupErr);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const meta = session.metadata || {};
      const orderId = parseInt(meta.order_id || "0", 10);
      const quoteId = parseInt(meta.quote_id || "0", 10);
      const paidAmount = (session.amount_total || 0) / 100;

      if (!orderId && !quoteId) {
        console.warn("[stripe-balance-webhook] checkout.session.completed without order_id or quote_id metadata");
        return new Response(JSON.stringify({ received: true, skipped: "no order_id or quote_id" }), { status: 200 });
      }

      // ── Quote payment → auto-create order ─────────────────────────────────
      // Customer paid via a link generated from a Quote. We:
      //   1. Fetch the quote
      //   2. INSERT a new order with amount_paid already set (CAPI trigger fires on INSERT)
      //   3. Delete the quote — it has served its purpose
      if (quoteId) {
        const { data: quote, error: quoteErr } = await admin
          .from("quotes")
          .select("*")
          .eq("id", quoteId)
          .single();

        if (quoteErr || !quote) {
          console.error(`[stripe-balance-webhook] quote ${quoteId} not found:`, quoteErr);
          return new Response(JSON.stringify({ received: true, error: "quote not found" }), { status: 200 });
        }

        // Build attribution — prefer quote's stored fbc/fbp, fall back to session metadata
        const attribution = {
          ...(quote.attribution || {}),
          ...(meta.fbp && !quote.attribution?.fbp ? { fbp: meta.fbp } : {}),
          ...(meta.fbc && !quote.attribution?.fbc ? { fbc: meta.fbc } : {}),
          source: quote.attribution?.source || "crm_quote_payment",
        };

        // Insert order — trigger_fire_capi_purchase fires on INSERT when amount_paid > 0
        const { data: newOrder, error: orderErr } = await admin
          .from("orders")
          .insert({
            customer_name:            quote.customer_name,
            customer_email:           quote.customer_email,
            customer_phone:           quote.customer_phone || null,
            customer_profile_url:     quote.customer_profile_url || null,
            design_name:              quote.design_name || null,
            patches_quantity:         quote.patches_quantity || 0,
            patches_type:             quote.patches_type || null,
            design_size:              quote.design_size || null,
            design_backing:           quote.design_backing || null,
            instructions:             quote.instructions || null,
            order_amount:             quote.estimated_amount || 0,
            amount_paid:              paidAmount,
            amount_remaining:         Math.max((quote.estimated_amount || 0) - paidAmount, 0),
            production_cost:          0,
            shipping_cost:            0,
            marketing_cost:           0,
            sales_agent:              quote.sales_agent,
            lead_source:              quote.lead_source || null,
            attribution,
            mockup_urls:              quote.mockup_urls || [],
            customer_attachment_urls: quote.customer_attachment_urls || [],
            is_urgent:                false,
            status:                   "NEW_ORDER",
            // Track conversion lineage (quote deleted below but these survive)
            converted_from_quote_id:     quote.id,
            converted_from_quote_number: quote.quote_number,
            had_prior_quote_request:     true,
          })
          .select("id, order_number")
          .single();

        if (orderErr || !newOrder) {
          console.error(`[stripe-balance-webhook] failed to create order from quote ${quoteId}:`, orderErr);
          return new Response(JSON.stringify({ received: true, error: "order creation failed" }), { status: 200 });
        }

        // Log in order history
        await admin.from("order_history").insert({
          order_id:      newOrder.id,
          user_email:    "stripe_webhook",
          field_changed: "ORDER_CREATED",
          old_value:     null,
          new_value:     `Auto-created from Quote ${quote.quote_number} via Stripe payment ($${paidAmount})`,
        }).catch(() => {}); // non-critical

        // Delete quote — order is safely created
        await admin.from("quotes").delete().eq("id", quoteId);

        console.log(`[stripe-balance-webhook] quote ${quote.quote_number} → order ${newOrder.order_number}: $${paidAmount} paid, CAPI queued`);

        return new Response(
          JSON.stringify({
            received:     true,
            quote_id:     quoteId,
            order_id:     newOrder.id,
            order_number: newOrder.order_number,
            paid:         paidAmount,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // ── Existing order payment → update amount_paid ───────────────────────
      const { data: order, error: orderErr } = await admin
        .from("orders")
        .select("id, order_number, amount_paid, order_amount, attribution")
        .eq("id", orderId)
        .single();

      if (orderErr || !order) {
        console.error(`[stripe-balance-webhook] order ${orderId} not found:`, orderErr);
        return new Response(JSON.stringify({ received: true, error: "order not found" }), { status: 200 });
      }

      const newAmountPaid = (order.amount_paid || 0) + paidAmount;

      // Carry forward attribution from session metadata if order doesn't have it
      const updatePayload: any = { amount_paid: newAmountPaid };
      if ((!order.attribution || (!order.attribution.fbp && !order.attribution.fbc))
          && (meta.fbp || meta.fbc)) {
        updatePayload.attribution = {
          ...(order.attribution || {}),
          fbp: meta.fbp || undefined,
          fbc: meta.fbc || undefined,
          source: "customer_portal_balance_payment",
        };
      }

      const { error: updateErr } = await admin
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);

      if (updateErr) {
        console.error(`[stripe-balance-webhook] failed to update order ${orderId}:`, updateErr);
        return new Response(JSON.stringify({ received: true, error: updateErr.message }), { status: 200 });
      }

      console.log(`[stripe-balance-webhook] order ${order.order_number}: +$${paidAmount} → $${newAmountPaid}/${order.order_amount}`);

      return new Response(
        JSON.stringify({
          received:       true,
          order_id:       orderId,
          paid:           paidAmount,
          new_amount_paid: newAmountPaid,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ received: true, type: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[stripe-balance-webhook] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
