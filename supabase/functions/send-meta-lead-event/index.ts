// supabase/functions/send-meta-lead-event/index.ts
// Fires Meta Conversions API pipeline-stage events (Lead, InitiateCheckout)
// when CRM order status advances through key stages.
//
// Triggered from orderService.ts after status change emails are sent.
// Idempotent per event_name: each stage fires at most once per order
// (tracked in orders.capi_lead_events JSONB array).
//
// Event mapping:
//   AWAITING_APPROVAL → Lead           (mockup sent = qualified lead)
//   IN_PRODUCTION / APPROVED → InitiateCheckout (customer approved = purchase intent)
//
// 2026 spec:
//   - Graph API v25.0, Pixel 1515101469424765
//   - action_source: business_messaging | website | system_generated
//   - event_id: "crm_<order_id>_<event_name>_<stage_slug>" for dedup

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const META_GRAPH_VERSION = "v25.0";
const META_PIXEL_ID = "1515101469424765";

const ALLOWED_ORIGINS = [
  "https://login.pandapatches.com",
  "https://portal.pandapatches.com",
  "https://panda-patches-crm-dashboard.vercel.app",
  "https://pandapatches.com",
];

function isAllowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:");
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Accepted event names — maps to the CRM status that triggers them
const VALID_EVENTS = ["Lead", "InitiateCheckout"] as const;
type LeadEventName = typeof VALID_EVENTS[number];

const bodySchema = z.object({
  order_id:   z.number().int().positive(),
  event_name: z.enum(VALID_EVENTS),
  // Optional: force re-fire even if already sent for this event
  force:      z.boolean().optional().default(false),
});

// ─── Hashing helpers (same as send-meta-purchase) ────────────────────────────
const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const norm = {
  email:   (v?: string | null) => v?.trim().toLowerCase() || null,
  phone:   (v?: string | null) => {
    if (!v) return null;
    const d = v.replace(/\D/g, "");
    return d.length >= 7 ? d : null;
  },
  name:    (v?: string | null) => {
    if (!v) return null;
    const c = v.trim().toLowerCase().replace(/[^a-z]/g, "");
    return c || null;
  },
  country: (v?: string | null) => {
    if (!v) return null;
    const map: Record<string, string> = {
      "usa": "us", "united states": "us", "us": "us",
      "australia": "au", "au": "au",
      "canada": "ca", "ca": "ca",
      "new zealand": "nz", "nz": "nz",
      "uk": "gb", "united kingdom": "gb", "gb": "gb",
      "france": "fr", "fr": "fr",
    };
    const lower = v.trim().toLowerCase();
    return map[lower] || lower.slice(0, 2) || null;
  },
};

async function hashIf(v: string | null): Promise<string | undefined> {
  return v ? await sha256(v) : undefined;
}

async function buildUserData(order: any) {
  const ud: Record<string, any> = {};

  const em = await hashIf(norm.email(order.customer_email));
  if (em) ud.em = [em];

  const ph = await hashIf(norm.phone(order.customer_phone));
  if (ph) ud.ph = [ph];

  if (order.customer_name) {
    const parts = order.customer_name.trim().split(/\s+/);
    const fn = await hashIf(norm.name(parts[0]));
    const ln = await hashIf(norm.name(parts.slice(1).join(" ")));
    if (fn) ud.fn = [fn];
    if (ln) ud.ln = [ln];
  }

  // external_id = hashed email (stable cross-order customer identifier)
  const xid = await hashIf(norm.email(order.customer_email));
  if (xid) ud.external_id = [xid];

  const cn = await hashIf(norm.country(order.country));
  if (cn) ud.country = [cn];

  const attr = order.attribution || {};
  if (attr.fbp) ud.fbp = String(attr.fbp);
  if (attr.fbc) ud.fbc = String(attr.fbc);
  if (attr.client_ip || attr.ip) ud.client_ip_address = String(attr.client_ip || attr.ip);
  const ua = attr.client_ua || attr.user_agent || attr.client_user_agent;
  if (ua) ud.client_user_agent = String(ua);

  return ud;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const META_TOKEN      = Deno.env.get("META_ACCESS_TOKEN") ?? "";
    const TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE") ?? "";

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");
    if (!META_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { order_id, event_name, force } = bodySchema.parse(await req.json());

    // Fetch order
    const { data: order, error } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (error || !order) throw new Error(`Order ${order_id} not found`);

    // Idempotency: skip if this event was already successfully fired
    const existingEvents: any[] = Array.isArray(order.capi_lead_events) ? order.capi_lead_events : [];
    const alreadySent = existingEvents.some(
      (e: any) => e.event_name === event_name && e.success === true
    );
    if (alreadySent && !force) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "already_sent", event_name }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Skip cancelled/refunded
    if (["CANCELLED", "REFUNDED"].includes(order.status)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Cancelled/refunded orders skip CAPI" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Build event
    const stageSlug = event_name.toLowerCase().replace(/[^a-z]/g, "");
    const eventId = `crm_${order.id}_${stageSlug}`;
    const userData = await buildUserData(order);
    const hasBrowserContext = !!(userData.fbp || userData.fbc);
    const attrSource = order.attribution?.source ?? "";
    const isFromMetaChat =
      attrSource === "meta_messenger" || attrSource === "meta_instagram";

    let actionSource: "website" | "business_messaging" | "system_generated";
    if (hasBrowserContext) actionSource = "website";
    else if (isFromMetaChat) actionSource = "business_messaging";
    else actionSource = "system_generated";

    const eventBody = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: actionSource,
          event_source_url: hasBrowserContext
            ? (order.attribution?.event_source_url || "https://pandapatches.com")
            : undefined,
          messaging_channel: isFromMetaChat
            ? (attrSource === "meta_instagram" ? "instagram" : "messenger")
            : undefined,
          user_data: userData,
          custom_data: {
            currency: "USD",
            // Lead: no value yet; InitiateCheckout: quote/order amount as intent signal
            value: event_name === "InitiateCheckout"
              ? Number(order.order_amount || 0)
              : 0,
            content_name: order.design_name || order.patches_type || "Custom Patches",
            content_type: "product",
            content_ids: [String(order.order_number || `pp_${order.id}`)],
            num_items: order.patches_quantity || 1,
            // CRM stage context for Meta's Conversion Leads reporting
            predicted_ltv: event_name === "InitiateCheckout"
              ? Number(order.order_amount || 0)
              : undefined,
            ad_id: order.attribution?.ad_id ?? undefined,
          },
        },
      ],
      ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };

    // Send to Meta
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${META_TOKEN}`;
    const metaRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const metaJson = await metaRes.json();
    const success = metaRes.ok && !metaJson.error;

    // Append to capi_lead_events log — keep existing entries, add new one
    const newEntry = {
      event_name,
      event_id: eventId,
      fired_at: new Date().toISOString(),
      action_source: actionSource,
      success,
      meta_response: metaJson,
    };

    // Use jsonb_insert to append without overwriting other events
    await admin.rpc("append_capi_lead_event", {
      p_order_id: order.id,
      p_event:    newEntry,
    });

    if (!success) {
      console.error(
        `[CAPI-Lead] ${event_name} failed for order ${order.order_number}:`,
        JSON.stringify(metaJson)
      );
      return new Response(
        JSON.stringify({ ok: false, event_name, meta_response: metaJson, event_id: eventId }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 502 }
      );
    }

    console.log(
      `[CAPI-Lead] ${event_name} sent for order ${order.order_number} (event_id=${eventId}, action_source=${actionSource})`
    );

    return new Response(
      JSON.stringify({ ok: true, event_name, event_id: eventId, action_source: actionSource, meta_response: metaJson }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: err.errors }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }
    console.error("[send-meta-lead-event] error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
