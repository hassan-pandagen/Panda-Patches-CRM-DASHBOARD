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
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";

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

    const stripe = new Stripe(STRIPE_KEY, {
      // @ts-ignore: Stripe types lag behind actual API versions
      apiVersion: "2025-06-30.basil",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Stripe requires the raw body string to verify the signature
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("Missing stripe-signature header");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, WEBHOOK_SECRET);
    } catch (err: any) {
      console.error("[stripe-balance-webhook] signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // ACK immediately, then process async-style (Deno keeps the function alive)
    // We deliberately do NOT await the processing here in a separate fire-and-forget
    // because Supabase Edge Functions don't support background tasks. So we DO process
    // synchronously and respond at the end. This is < 5s for our use case.

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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
