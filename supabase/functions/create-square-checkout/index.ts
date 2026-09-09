// supabase/functions/create-square-checkout/index.ts
// Called from PaymentFormLandingPage when customer clicks Pay.
// Creates a Square Checkout session and returns the checkout URL.
// Sets reference_id = token so square-payment-webhook can look up the token.

// Deno-native JSR import, NOT esm.sh — the esm.sh build bundles Node `ws`, which crashed
// square-payment-webhook on cold boot (`node:url not found`) and took the whole Square path
// down for ~2 days on 2026-08-08. jsr uses the built-in WebSocket. See memory: square-webhook-esmsh-ws-crash.
import { createClient } from "jsr:@supabase/supabase-js@2";
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
  border_type:      z.string().optional().nullable(),
  sample_box:       z.boolean().optional(),
  country:          z.string().optional().nullable(),
  purchase_order:   z.string().optional().nullable(),
  organization:     z.string().optional().nullable(),
  instructions:     z.string().optional().nullable(),
  sample_box_fee:   z.number().optional().nullable(),
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
      body.sample_box_fee ? `+ Sample Box ($${body.sample_box_fee})` : null,
    ].filter(Boolean).join(" ");

    const paymentLabel = body.payment_type === "deposit"
      ? (body.deposit_pct ? `${body.deposit_pct}% Deposit` : "Deposit")
      : "Full Payment";

    // Amount in cents
    const amountCents = Math.round(body.charge_amount * 100);

    // Square Checkout API
    // Unique per request. The key used to be `pf_<token>_<payment_type>`, which is stable for a
    // given pay link — but almost everything else in this request is NOT: the customer can tick
    // "Include a Sample Box (+$20)", the agent can change the Order Total, and the quantity /
    // type / size / design name all feed the Square line-item name. Square stores the request
    // body against the key, so the SECOND attempt with any of those changed came back as
    // IDEMPOTENCY_KEY_REUSED — surfaced to the customer, on the payment page, as "This
    // idempotency key has already been used to create a Payment Link", with no way past it.
    // They simply could not pay. Seen on an $830 order, 8 Sept.
    //
    // Safe to randomise, for the same reasons already documented in create-square-payment-link:
    // nothing is charged until the customer completes checkout on Square's own page,
    // square-payment-webhook dedups at the payment.id level (square_processed_payments), and the
    // token's own used_at guard stops a link being spent twice. Extra links cost nothing.
    const idempotencyKey = `pf_${body.token}_${body.payment_type}_${crypto.randomUUID()}`;
    const redirectUrl    = `https://login.pandapatches.com/pay/${body.token}/thank-you`;

    const checkoutBody = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: SQUARE_LOCATION,
        reference_id: body.token, // webhook uses this to find the token
        // CL0FAA §1: the invoice number shown on the pay page before the order exists
        // (see PaymentFormLandingPage.tsx) — carried onto the Square order/receipt so the two
        // reconcile 1:1.
        note: `Invoice INV-PF-${tokenRow.id}`,
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
      // Log Square's own wording in full — that is what makes the next one diagnosable.
      console.error("[create-square-checkout] Square error:", JSON.stringify(squareJson.errors));
      // But do NOT hand it to the customer. This message renders on the payment page of a real
      // person about to spend hundreds of dollars, and Square's text is written for developers
      // ("This idempotency key has already been used to create a Payment Link") — it reads as
      // something broken and unsafe, and tells them nothing they can act on.
      throw new Error("We couldn't start the secure checkout. Please try again — if it keeps happening, reply to your sales agent and we'll send you a fresh payment link.");
    }

    const checkoutUrl = squareJson.payment_link?.url;
    if (!checkoutUrl) throw new Error("No checkout URL in Square response");

    // Update token with customer details and Square order ID
    await admin.from("payment_form_tokens").update({
      customer_name:    body.customer_name,
      customer_email:   body.customer_email,
      customer_phone:   body.customer_phone || null,
      // Persist the address the customer typed on the pay page (or the agent prefilled) — this was
      // accepted but never stored, so every payment-form order lost its shipping address.
      shipping_address: body.shipping_address || null,
      design_name:      body.design_name    || null,
      patches_type:     body.patches_type,
      patches_quantity: body.patches_quantity,
      design_size:      body.design_size    || null,
      design_backing:   body.design_backing || null,
      border_type:      body.border_type    || null,
      sample_box:       body.sample_box ?? false,
      country:          body.country        || null,
      purchase_order:   body.purchase_order || null,
      organization:     body.organization   || null,
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
