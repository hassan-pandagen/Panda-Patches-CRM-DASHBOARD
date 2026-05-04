// supabase/functions/reverse-meta-purchase/index.ts
// Reverses a previously-fired Meta CAPI Purchase event when an order is
// cancelled or refunded. Sends a Purchase event with NEGATIVE value
// using the same event_id (Meta's documented correction pattern).
//
// Only callable by staff (verified via JWT + user_profiles).
// Idempotent: orders.capi_purchase_reversed flag prevents double-reversal.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const META_GRAPH_VERSION = "v25.0";
const META_PIXEL_ID = "1515101469424765";

const ALLOWED_ORIGINS = [
  "https://login.pandapatches.com",          // customer portal (read-only context)
  "https://portal.pandapatches.com",          // staff CRM admin retry
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
  reason: z.string().max(500).optional(),
});

// Hash helpers
const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (v?: string | null) => v?.trim().toLowerCase() || null;
async function hashIf(v: string | null) {
  return v ? await sha256(v) : undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const META_TOKEN   = Deno.env.get("META_ACCESS_TOKEN") ?? "";
    const TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE") ?? "";

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("Supabase env vars missing");
    if (!META_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    // ── Authenticate caller ──────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Invalid session");

    // Must be staff
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!staffProfile) {
      return new Response(
        JSON.stringify({ error: "Only staff can reverse CAPI events" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { order_id, reason } = bodySchema.parse(await req.json());

    // ── Load order ───────────────────────────────────────
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) throw new Error(`Order ${order_id} not found`);

    if (!order.capi_purchase_sent) {
      return new Response(
        JSON.stringify({ error: "Order's CAPI Purchase was never sent — nothing to reverse" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    if ((order as any).capi_purchase_reversed) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "already_reversed" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── Build reversal event (negative value, same event_id, same hashed PII) ──
    const eventId = order.capi_purchase_event_id || `order_${order.id}_purchase`;
    const userData: Record<string, any> = {};
    const em = await hashIf(normEmail(order.customer_email));
    if (em) userData.em = [em];
    const xid = await hashIf(normEmail(order.customer_email));
    if (xid) userData.external_id = [xid];

    const eventBody = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "system_generated",
          user_data: userData,
          custom_data: {
            currency: "USD",
            // Negative value to net the original event to zero
            value: -Number(order.order_amount),
            order_id: String(order.id),
            content_type: "product",
            content_ids: [String(order.order_number || `pp_${order.id}`)],
            reversal_reason: reason || "order_cancelled",
          },
        },
      ],
      ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${META_TOKEN}`;
    const metaRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const metaJson = await metaRes.json();

    const success = metaRes.ok && !metaJson.error;

    // Persist reversal status (we use the existing capi_purchase_response column to also store reversal info)
    const updatePayload: any = {
      capi_purchase_response: {
        ...(order.capi_purchase_response || {}),
        reversal: {
          attempted_at: new Date().toISOString(),
          attempted_by: user.email,
          reason: reason || null,
          success,
          response: metaJson,
        },
      },
    };
    // Add capi_purchase_reversed flag if column exists (we'll add it via migration)
    updatePayload.capi_purchase_reversed = success;

    await admin.from("orders").update(updatePayload).eq("id", order.id);

    if (!success) {
      console.error("[reverse-meta-purchase] failed:", metaJson);
      return new Response(
        JSON.stringify({ ok: false, meta_response: metaJson }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 502 }
      );
    }

    console.log(`[CAPI] Purchase reversed for order ${order.order_number} (-$${order.order_amount})`);

    return new Response(
      JSON.stringify({ ok: true, event_id: eventId, meta_response: metaJson }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: err.errors }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }
    console.error("[reverse-meta-purchase] error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
