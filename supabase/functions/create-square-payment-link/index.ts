// supabase/functions/create-square-payment-link/index.ts
// Agent-facing: from the CRM, generate a Square payment link for an EXISTING order or a quote,
// then share it with the customer (WhatsApp / Email / Copy). Replaces the old Stripe
// create_stripe_payment_link RPCs.
//
// reference_id scheme (read back by square-payment-webhook):
//   - order mode  -> order.order_number  (e.g. "PP-10234")  -> webhook Flow B: order.amount_paid += paid
//   - quote mode  -> "QUOTE-<quote_id>"                       -> webhook Flow C: create order from quote, delete quote
//
// Auth: caller must be an authenticated STAFF user (row in user_profiles). We verify the JWT,
// then do all DB reads/writes with the service-role client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SQUARE_BASE_URL = "https://connect.squareup.com"; // production
const SQUARE_API_VERSION = "2025-05-21";

const ALLOWED_ORIGINS = [
  "https://portal.pandapatches.com",
  "https://panda-patches-crm-dashboard.vercel.app",
  "https://login.pandapatches.com",
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
  mode:   z.enum(["order", "quote"]),
  id:     z.number().int().positive(),      // order id or quote id
  amount: z.number().positive(),
  label:  z.enum(["deposit", "balance", "full", "custom"]).default("custom"),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const cors = getCorsHeaders(req);
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SQUARE_TOKEN    = Deno.env.get("SQUARE_ACCESS_TOKEN") ?? "";
    const SQUARE_LOCATION = Deno.env.get("SQUARE_LOCATION_ID") ?? "";

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");
    if (!SQUARE_TOKEN)    throw new Error("SQUARE_ACCESS_TOKEN not configured");
    if (!SQUARE_LOCATION) throw new Error("SQUARE_LOCATION_ID not configured");

    // ── Verify the caller is authenticated staff ──────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: staff } = await admin
      .from("user_profiles")
      .select("email")
      .eq("id", user.id)
      .single();
    if (!staff) return json({ error: "Not authorized" }, 403);

    const body = bodySchema.parse(await req.json());

    // ── Resolve reference row + validate amount ───────────────────────────────
    let referenceId: string;
    let refNumber: string;
    let customerName: string | null;
    let customerEmail: string | null;
    let itemName: string;
    let orderRowId: number | null = null;

    if (body.mode === "order") {
      const { data: order, error } = await admin
        .from("orders")
        .select("id, order_number, customer_name, customer_email, order_amount, amount_paid, patches_type, patches_quantity, design_name, status")
        .eq("id", body.id)
        .single();
      if (error || !order) return json({ error: "Order not found" }, 404);
      if (["CANCELLED", "REFUNDED"].includes(order.status)) {
        return json({ error: "Cannot create a payment link for a cancelled/refunded order" }, 400);
      }
      const remaining = Math.max((order.order_amount || 0) - (order.amount_paid || 0), 0);
      if (remaining <= 0) return json({ error: "This order is already fully paid" }, 400);
      if (body.amount > remaining + 0.01) {
        return json({ error: `Amount $${body.amount.toFixed(2)} exceeds remaining balance $${remaining.toFixed(2)}` }, 400);
      }
      referenceId   = order.order_number;                       // "PP-XXXXX" -> webhook Flow B
      refNumber     = order.order_number;
      customerName  = order.customer_name;
      customerEmail = order.customer_email;
      orderRowId    = order.id;
      itemName      = [order.patches_quantity, order.patches_type, order.design_name ? `— ${order.design_name}` : null]
        .filter(Boolean).join(" ") || `Order ${order.order_number}`;
    } else {
      const { data: quote, error } = await admin
        .from("quotes")
        .select("id, quote_number, customer_name, customer_email, estimated_amount, patches_type, patches_quantity, design_name")
        .eq("id", body.id)
        .single();
      if (error || !quote) return json({ error: "Quote not found" }, 404);
      const estimated = quote.estimated_amount || 0;
      if (estimated <= 0) return json({ error: "Set an estimated amount on the quote first" }, 400);
      if (body.amount > estimated + 0.01) {
        return json({ error: `Amount $${body.amount.toFixed(2)} exceeds quote amount $${estimated.toFixed(2)}` }, 400);
      }
      referenceId   = `QUOTE-${quote.id}`;                      // -> webhook Flow C
      refNumber     = quote.quote_number;
      customerName  = quote.customer_name;
      customerEmail = quote.customer_email;
      itemName      = [quote.patches_quantity, quote.patches_type, quote.design_name ? `— ${quote.design_name}` : null]
        .filter(Boolean).join(" ") || `Quote ${quote.quote_number}`;
    }

    const labelText = body.label === "deposit" ? "Deposit"
      : body.label === "balance" ? "Balance Payment"
      : body.label === "full"    ? "Full Payment"
      : "Payment";

    // ── Create the Square payment link ────────────────────────────────────────
    const amountCents = Math.round(body.amount * 100);
    const idempotencyKey = `ppl_${body.mode}_${body.id}_${amountCents}_${body.label}`;
    // These links are sent to CUSTOMERS (who may not have a portal session), and in quote mode
    // the quote is deleted on payment — so land them on the public login page rather than a
    // portal-authed order/quote route that would 404 or bounce to auth.
    const redirectUrl = "https://pandapatches.com/login?paid=1";

    const checkoutBody = {
      idempotency_key: idempotencyKey,
      order: {
        location_id:  SQUARE_LOCATION,
        reference_id: referenceId, // webhook reads this off the Square order
        line_items: [
          {
            name:     `${itemName} — ${labelText}`,
            quantity: "1",
            base_price_money: { amount: amountCents, currency: "USD" },
          },
        ],
        metadata: {
          mode:         body.mode,
          reference_id: referenceId,
          label:        body.label,
          created_by:   staff.email,
        },
      },
      pre_populated_data: customerEmail ? { buyer_email: customerEmail } : undefined,
      redirect_url: redirectUrl,
      merchant_support_email: "hello@pandapatches.com",
    };

    const squareRes = await fetch(`${SQUARE_BASE_URL}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${SQUARE_TOKEN}`,
        "Content-Type":   "application/json",
        "Square-Version": SQUARE_API_VERSION,
      },
      body: JSON.stringify(checkoutBody),
    });

    const squareJson = await squareRes.json();
    if (!squareRes.ok || squareJson.errors) {
      console.error("[create-square-payment-link] Square error:", JSON.stringify(squareJson.errors));
      throw new Error(squareJson.errors?.[0]?.detail || "Square payment-link creation failed");
    }

    const checkoutUrl = squareJson.payment_link?.url;
    if (!checkoutUrl) throw new Error("No checkout URL in Square response");

    // Audit trail for orders (quotes don't exist yet as an order)
    if (orderRowId) {
      await admin.from("order_history").insert({
        order_id:      orderRowId,
        user_email:    staff.email,
        field_changed: "square_payment_link",
        old_value:     null,
        new_value:     `Generated $${body.amount.toFixed(2)} ${body.label} Square link`,
      }).then(() => {}, () => {});
    }

    console.log(`[create-square-payment-link] ${body.mode} ${refNumber}: $${body.amount} ${body.label} link created`);

    return json({
      ok: true,
      url: checkoutUrl,
      amount: body.amount,
      order_number: refNumber,
      customer_email: customerEmail || "",
      customer_name: customerName || "",
    });

  } catch (err: any) {
    if (err?.name === "ZodError") {
      return json({ error: "Validation failed", details: err.errors }, 400);
    }
    console.error("[create-square-payment-link] error:", err.message);
    return json({ error: err.message }, 500);
  }
});
