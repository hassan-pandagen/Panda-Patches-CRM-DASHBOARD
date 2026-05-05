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

      if (!orderId) {
        console.warn("[stripe-balance-webhook] checkout.session.completed without order_id metadata");
        return new Response(JSON.stringify({ received: true, skipped: "no order_id" }), { status: 200 });
      }

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
      // (so CAPI Purchase has fbp/fbc when fired by the trigger).
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
