// supabase/functions/create-stripe-checkout/index.ts
// Creates a Stripe Checkout Session for an order. Two callers:
//   1. Customer (from /customer/order/X portal) — pays their own outstanding balance.
//   2. Staff agent (from CRM order detail) — generates a payment link to send to customer.
//
// In both cases, on payment our stripe-balance-webhook updates orders.amount_paid,
// which fires the CAPI Purchase event via the Postgres trigger.
//
// We call Stripe's REST API directly via fetch instead of importing the Stripe SDK.
// The SDK (any version) has had recurring import/boot failures on Supabase Edge Runtime
// (Deno) — esm.sh's bundle for the SDK trips up the loader. Direct REST calls work always.

// Pin to 2.49.10+ — 2.49.9 had a JSR resolution bug that caused gateway 502s on boot.
// See: https://github.com/orgs/supabase/discussions/36109
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const STRIPE_API = "https://api.stripe.com/v1";

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
  amount: z.number().positive().optional(),
  label: z.enum(['deposit', 'balance', 'full', 'custom']).optional().default('custom'),
});

// Stripe expects application/x-www-form-urlencoded with bracketed nested keys:
//   line_items[0][price_data][currency]=usd
// This helper turns a plain object/array structure into that form.
function stripeFormEncode(obj: Record<string, any>, prefix = ""): string {
  const parts: string[] = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const fieldName = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (typeof item === "object" && item !== null) {
          parts.push(stripeFormEncode(item, `${fieldName}[${idx}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fieldName}[${idx}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(stripeFormEncode(value, fieldName));
    } else {
      parts.push(`${encodeURIComponent(fieldName)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeRequest(path: string, body: Record<string, any>, secretKey: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stripeFormEncode(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe API ${res.status}`);
    (err as any).code = json?.error?.code;
    (err as any).type = json?.error?.type;
    (err as any).status = res.status;
    throw err;
  }
  return json;
}

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

    const labelText = (() => {
      const isPartial = chargeAmount < remaining - 0.01;
      const labelMap: Record<string, string> = {
        deposit: ' — Deposit Payment',
        balance: ' — Balance Payment',
        full: '',
        custom: isPartial ? ' — Partial Payment' : '',
      };
      return labelMap[label] ?? '';
    })();

    const sessionParams: Record<string, any> = {
      mode: "payment",
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
      metadata: {
        order_id: String(order.id),
        order_number: String(order.order_number || ""),
        payment_kind: label,
        capi_event_id: `order_${order.id}_purchase`,
        origin: isStaff ? "crm_agent" : "customer_portal",
        agent_user_id: isStaff ? String(user.id) : "",
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
    };

    if (orderEmail) sessionParams.customer_email = orderEmail;

    let session;
    try {
      session = await stripeRequest("/checkout/sessions", sessionParams, STRIPE_KEY);
    } catch (stripeErr: any) {
      console.error("[create-stripe-checkout] Stripe API error:", stripeErr?.message, stripeErr?.code, stripeErr?.type);
      return new Response(
        JSON.stringify({
          error: `Stripe error: ${stripeErr?.message || 'unknown'}`,
          code: stripeErr?.code,
          type: stripeErr?.type,
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 502 }
      );
    }

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
