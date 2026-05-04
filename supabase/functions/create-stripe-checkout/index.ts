// supabase/functions/create-stripe-checkout/index.ts
// Creates a Stripe Checkout Session for an order. Two callers:
//   1. Customer (from /customer/order/X portal) — pays their own outstanding balance.
//   2. Staff agent (from CRM order detail) — generates a payment link to send to customer.
//
// In both cases, on payment our stripe-balance-webhook updates orders.amount_paid,
// which fires the CAPI Purchase event via the Postgres trigger.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  "https://login.pandapatches.com",
  "https://portal.pandapatches.com",
  "https://panda-patches-crm-dashboard.vercel.app",
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:");
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const bodySchema = z.object({
  order_id: z.number().int().positive(),
  // Optional: agent can specify amount (defaults to remaining balance).
  // Useful for collecting deposits like 50% upfront.
  amount: z.number().positive().optional(),
  // Optional: agent label for the payment (e.g. "Deposit", "Balance", "Custom")
  label: z.enum(['deposit', 'balance', 'full', 'custom']).optional().default('custom'),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const STRIPE_KEY   = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("Supabase env vars missing");
    if (!STRIPE_KEY) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-12-18.acacia" });

    // ── Authenticate the caller ──────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Invalid session");

    const { order_id, amount, label } = bodySchema.parse(await req.json());

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Determine if caller is staff or customer ─────────
    const [staffRes, customerRes] = await Promise.all([
      admin.from("user_profiles").select("id, email").eq("id", user.id).maybeSingle(),
      admin.from("customer_profiles").select("id, email").eq("id", user.id).maybeSingle(),
    ]);

    const isStaff = !!staffRes.data;
    const isCustomer = !staffRes.data && !!customerRes.data;

    if (!isStaff && !isCustomer) {
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
      );
    }

    // ── Load the order ───────────────────────────────────
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) throw new Error(`Order ${order_id} not found`);

    // ── Customer authorization: must own the order ───────
    if (isCustomer) {
      const callerEmail = customerRes.data?.email?.toLowerCase();
      const orderEmail = (order.customer_email || "").toLowerCase();
      const orderCcEmail = (order.cc_email || "").toLowerCase();
      if (!callerEmail || (callerEmail !== orderEmail && callerEmail !== orderCcEmail)) {
        return new Response(
          JSON.stringify({ error: "Not authorized to pay this order" }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
        );
      }
    }
    // Staff are allowed to generate links for any order — no further auth needed.

    // ── Validate balance ─────────────────────────────────
    const remaining = (order.order_amount || 0) - (order.amount_paid || 0);
    if (remaining <= 0) {
      return new Response(
        JSON.stringify({ error: "This order is already fully paid" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (["CANCELLED", "REFUNDED"].includes(order.status)) {
      return new Response(
        JSON.stringify({ error: "Cannot create payment link for a cancelled/refunded order" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ── Determine charge amount ──────────────────────────
    // Customer always pays the full remaining balance.
    // Staff can specify a partial amount (e.g. 50% deposit).
    let chargeAmount = remaining;
    if (isStaff && amount) {
      if (amount > remaining + 0.01) {
        return new Response(
          JSON.stringify({ error: `Amount $${amount} exceeds remaining balance $${remaining.toFixed(2)}` }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
        );
      }
      chargeAmount = amount;
    }

    // ── Build the Checkout Session ───────────────────────
    const orderEmail = (order.customer_email || "").toLowerCase();
    const productLabel =
      order.design_name && order.patches_quantity
        ? `${order.patches_type || "Patches"} × ${order.patches_quantity} (${order.design_name})`
        : `Order ${order.order_number}`;

    // Friendly label on the Checkout page
    const labelText = (() => {
      const isPartial = chargeAmount < remaining - 0.01;
      const labelMap = {
        deposit: ' — Deposit Payment',
        balance: ' — Balance Payment',
        full: '',
        custom: isPartial ? ' — Partial Payment' : '',
      };
      return labelMap[label] ?? '';
    })();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${productLabel}${labelText}`,
              description: order.design_name
                ? `Order ${order.order_number} · ${order.design_name}`
                : `Order ${order.order_number}`,
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: orderEmail || undefined,
      metadata: {
        order_id: String(order.id),
        order_number: String(order.order_number || ""),
        payment_kind: label,
        capi_event_id: `order_${order.id}_purchase`,
        // Indicate origin so webhook knows where it came from
        origin: isStaff ? "crm_agent" : "customer_portal",
        agent_user_id: isStaff ? String(user.id) : "",
        // Carry attribution forward so webhook can attach fbp/fbc to CAPI event if not already on order
        fbp: String(order.attribution?.fbp || ""),
        fbc: String(order.attribution?.fbc || ""),
      },
      success_url: isStaff
        ? `https://portal.pandapatches.com/order/${order.order_number}?paid=1`
        : `https://login.pandapatches.com/customer/order/${order.order_number}?paid=1`,
      cancel_url: isStaff
        ? `https://portal.pandapatches.com/order/${order.order_number}?cancelled=1`
        : `https://login.pandapatches.com/customer/order/${order.order_number}?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    });

    // Log the link generation in order_history for audit
    await admin.from("order_history").insert({
      order_id: order.id,
      user_email: isStaff ? (staffRes.data?.email || "system") : "customer_portal",
      field_changed: "stripe_payment_link",
      old_value: "",
      new_value: `Generated $${chargeAmount.toFixed(2)} ${label} link (session ${session.id})`,
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        amount: chargeAmount,
        order_number: order.order_number,
        customer_email: orderEmail,
        customer_name: order.customer_name,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: err.errors }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }
    console.error("[create-stripe-checkout] error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
