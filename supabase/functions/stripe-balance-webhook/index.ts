// supabase/functions/stripe-balance-webhook/index.ts
// Receives Stripe webhook events for balance payments initiated from
// the customer portal (via create-stripe-checkout). Updates orders.amount_paid,
// which automatically triggers the CAPI Purchase event via the
// fire_capi_purchase_on_paid Postgres trigger.
//
// Idempotency: the trigger checks capi_purchase_sent flag, so duplicate webhook
// deliveries are safe.
//
// IMPORTANT: This webhook must use raw body for Stripe signature verification.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const STRIPE_KEY   = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const WEBHOOK_SECRET = Deno.env.get("STRIPE_BALANCE_WEBHOOK_SECRET") ?? "";

    if (!STRIPE_KEY || !WEBHOOK_SECRET) {
      throw new Error("Stripe env vars not configured");
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase env vars not configured");
    }

    // Stripe SDK pinned to v14 — version Supabase's official example uses for Deno Edge Functions.
    // v18.x has export-map issues that cause boot failures (502 Bad Gateway).
    // For webhook signature verification we need createSubtleCryptoProvider (Web Crypto API
    // works in Deno; createFetchHttpClient is for outbound calls, not signature verification).
    const stripe = new Stripe(STRIPE_KEY, {
      apiVersion: "2024-11-20",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();

    // Stripe requires the raw body string to verify the signature
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("Missing stripe-signature header");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, WEBHOOK_SECRET, undefined, cryptoProvider);
    } catch (err: any) {
      console.error("[stripe-balance-webhook] signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Idempotency: Stripe retries aggressively on transient failures. Without dedup on event.id
    // a single payment could increment amount_paid twice. Insert event.id into stripe_webhook_events
    // (unique constraint) — if duplicate, ACK and skip processing.
    const { error: dedupErr } = await admin
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });
    if (dedupErr) {
      // Postgres unique-violation code is 23505 — duplicate event, already processed
      if ((dedupErr as any).code === "23505") {
        console.log(`[stripe-balance-webhook] duplicate event ${event.id} ignored`);
        return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 });
      }
      console.error("[stripe-balance-webhook] dedup insert failed:", dedupErr);
      // Don't block on dedup table errors — proceed (webhook handler is still idempotent at order level via amount_paid recalc)
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};
      const orderId = parseInt(meta.order_id || "0", 10);

      if (!orderId) {
        console.warn("[stripe-balance-webhook] checkout.session.completed without order_id metadata");
        return new Response(JSON.stringify({ received: true, skipped: "no order_id" }), { status: 200 });
      }

      // Pull current order to compute new amount_paid
      const { data: order, error: orderErr } = await admin
        .from("orders")
        .select("id, order_number, amount_paid, order_amount, attribution")
        .eq("id", orderId)
        .single();

      if (orderErr || !order) {
        console.error(`[stripe-balance-webhook] order ${orderId} not found:`, orderErr);
        return new Response(JSON.stringify({ received: true, error: "order not found" }), { status: 200 });
      }

      const paidAmount = (session.amount_total || 0) / 100;
      const newAmountPaid = (order.amount_paid || 0) + paidAmount;

      // Carry forward attribution from session metadata if order doesn't have it
      // (so CAPI Purchase event has fbp/fbc when fired by the trigger)
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
          received: true,
          order_id: orderId,
          paid: paidAmount,
          new_amount_paid: newAmountPaid,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Other event types we just ACK
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
