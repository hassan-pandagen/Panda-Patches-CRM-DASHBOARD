// supabase/functions/create-square-checkout/index.ts
// Called from PaymentFormLandingPage when customer clicks Pay.
// Creates a Square Checkout session and returns the checkout URL.
// Sets reference_id = token so square-payment-webhook can look up the token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SQUARE_BASE_URL = "https://connect.squareup.com"; // production
const SQUARE_API_VERSION = "2025-05-21";

const ALLOWED_ORIGINS = [
  "https://login.pandapatches.com",
  "https://portal.pandapatches.com",
  "https://panda-patches-crm-dashboard.vercel.app",
  "https://pandapatches.com",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const bodySchema = z.object({
  token:            z.string().uuid(),
  customer_name:    z.string().min(1),
  customer_email:   z.string().email(),
  customer_phone:   z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  design_name:      z.string().optional().nullable(),
  patches_type:     z.string().min(1),
  patches_quantity: z.number().int().positive(),
  design_size:      z.string().optional().nullable(),
  design_backing:   z.string().optional().nullable(),
  instructions:     z.string().optional().nullable(),
  order_amount:     z.number().positive(),
  charge_amount:    z.number().positive(),
  payment_type:     z.enum(["full", "deposit"]),
  deposit_pct:      z.number().optional().nullable(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const SQUARE_TOKEN    = Deno.env.get("SQUARE_ACCESS_TOKEN") ?? "";
    const SQUARE_LOCATION = Deno.env.get("SQUARE_LOCATION_ID") ?? "";

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");
    if (!SQUARE_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN not configured");
    if (!SQUARE_LOCATION) throw new Error("SQUARE_LOCATION_ID not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body  = bodySchema.parse(await req.json());

    // Validate token exists and is not used/expired
    const { data: tokenRow, error: tokenErr } = await admin
      .from("payment_form_tokens")
      .select("id, used_at, expires_at, attribution, created_by")
      .eq("token", body.token)
      .single();

    if (tokenErr || !tokenRow) throw new Error("Payment link not found");
    if (tokenRow.used_at) throw new Error("This payment link has already been used");
    if (new Date(tokenRow.expires_at) < new Date()) throw new Error("This payment link has expired");

    // Build item name
    const itemName = [
      body.patches_quantity,
      body.patches_type,
      body.design_size ? `(${body.design_size})` : null,
      body.design_name ? `— ${body.design_name}` : null,
    ].filter(Boolean).join(" ");

    const paymentLabel = body.payment_type === "deposit"
      ? `${body.deposit_pct}% Deposit`
      : "Full Payment";

    // Amount in cents
    const amountCents = Math.round(body.charge_amount * 100);

    // Square Checkout API
    const idempotencyKey = `pf_${body.token}_${body.payment_type}`;
    const redirectUrl    = `https://login.pandapatches.com/pay/${body.token}/thank-you`;

    const checkoutBody = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: SQUARE_LOCATION,
        reference_id: body.token, // webhook uses this to find the token
        line_items: [
          {
            name:     `${itemName} — ${paymentLabel}`,
            quantity: "1",
            base_price_money: {
              amount:   amountCents,
              currency: "USD",
            },
          },
        ],
        metadata: {
          token:        body.token,
          payment_type: body.payment_type,
          order_amount: String(body.order_amount),
          charge_amount: String(body.charge_amount),
          created_by:   tokenRow.created_by,
        },
      },
      // Phone intentionally omitted — Square rejects non-E.164 numbers and would
      // fail the whole checkout. Phone is still saved to the DB below. Email only here.
      pre_populated_data: {
        buyer_email: body.customer_email,
      },
      redirect_url: redirectUrl,
      merchant_support_email: "hello@pandapatches.com",
    };

    const squareRes = await fetch(
      `${SQUARE_BASE_URL}/v2/online-checkout/payment-links`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SQUARE_TOKEN}`,
          "Content-Type":  "application/json",
          "Square-Version": SQUARE_API_VERSION,
        },
        body: JSON.stringify(checkoutBody),
      }
    );

    const squareJson = await squareRes.json();

    if (!squareRes.ok || squareJson.errors) {
      console.error("[create-square-checkout] Square error:", JSON.stringify(squareJson.errors));
      throw new Error(squareJson.errors?.[0]?.detail || "Square checkout creation failed");
    }

    const checkoutUrl = squareJson.payment_link?.url;
    if (!checkoutUrl) throw new Error("No checkout URL in Square response");

    // Update token with customer details and Square order ID
    await admin.from("payment_form_tokens").update({
      customer_name:    body.customer_name,
      customer_email:   body.customer_email,
      customer_phone:   body.customer_phone || null,
      design_name:      body.design_name    || null,
      patches_type:     body.patches_type,
      patches_quantity: body.patches_quantity,
      design_size:      body.design_size    || null,
      design_backing:   body.design_backing || null,
      instructions:     body.instructions   || null,
      order_amount:     body.order_amount,
    }).eq("id", tokenRow.id);

    console.log(`[create-square-checkout] token ${body.token}: $${body.charge_amount} ${body.payment_type} checkout created`);

    return new Response(
      JSON.stringify({ ok: true, checkout_url: checkoutUrl }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(JSON.stringify({ error: "Validation failed", details: err.errors }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    console.error("[create-square-checkout] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
