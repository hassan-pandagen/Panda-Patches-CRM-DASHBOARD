// supabase/functions/send-meta-purchase/index.ts
// Fires a Meta Conversions API Purchase event when an order becomes fully paid.
// Called by the fire_capi_purchase_on_paid Postgres trigger via pg_net.
// Idempotent: capi_purchase_sent flag on orders table prevents double-fires.
//
// 2026 spec compliance:
//   - Graph API v25.0
//   - SHA-256 hex lowercase hashing for PII
//   - external_id, fbp, fbc, ip, user_agent for high EMQ
//   - Stable event_id per order for browser↔server dedup
//   - action_source = "website" if fbp/fbc present, else "system_generated"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const META_GRAPH_VERSION = "v25.0";
const META_PIXEL_ID = "1515101469424765"; // Production Pixel — never use 2084250398990867 (test)

const ALLOWED_ORIGINS = [
  "https://login.pandapatches.com",          // customer portal (read context)
  "https://portal.pandapatches.com",          // staff CRM admin retry button
  "https://panda-patches-crm-dashboard.vercel.app",
  "https://pandapatches.com",                 // public website (server-to-server is unaffected)
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
  // Optional: force-resend even if already sent (admin retry)
  force: z.boolean().optional().default(false),
});

// ─────────────────────────────────────────────────────────────
// Hashing helpers (Deno crypto.subtle, SHA-256 hex lowercase)
// ─────────────────────────────────────────────────────────────
const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const norm = {
  email:   (v?: string | null) => (v?.trim().toLowerCase() || null),
  // E.164-style: digits only, retain country code if present
  phone:   (v?: string | null) => {
    if (!v) return null;
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
  },
  // Names: lowercase, strip everything but a-z
  name:    (v?: string | null) => {
    if (!v) return null;
    const cleaned = v.trim().toLowerCase().replace(/[^a-z]/g, "");
    return cleaned || null;
  },
  city:    (v?: string | null) => (v?.trim().toLowerCase().replace(/\s/g, "") || null),
  zip:     (v?: string | null) => {
    if (!v) return null;
    const cleaned = v.trim().toLowerCase().split("-")[0];
    return cleaned || null;
  },
  country: (v?: string | null) => {
    if (!v) return null;
    // Map full names to ISO-3166-1 alpha-2
    const map: Record<string, string> = {
      "usa": "us", "united states": "us", "us": "us",
      "australia": "au", "au": "au",
      "canada": "ca", "ca": "ca",
      "new zealand": "nz", "nz": "nz",
      "uk": "gb", "united kingdom": "gb", "gb": "gb",
    };
    const lower = v.trim().toLowerCase();
    return map[lower] || lower.slice(0, 2) || null;
  },
  state:   (v?: string | null) => (v?.trim().toLowerCase().replace(/[^a-z]/g, "") || null),
};

async function hashIf(v: string | null): Promise<string | undefined> {
  return v ? await sha256(v) : undefined;
}

// ─────────────────────────────────────────────────────────────
// Build user_data with all available signals
// ─────────────────────────────────────────────────────────────
// Parse free-text US shipping address into city/state/zip components.
// Real data shows formats like:
//   "68 Talcott Ave, Crystal Lake, IL 60014"
//   "1234 Main St Apt 5, Los Angeles, CA 90001-1234"
//   "PO Box 99, Some Town, TX 75001"
// Strategy: ZIP is the most reliable anchor (5-digit pattern). State is the
// 2-letter code right before the ZIP. City is what's between the previous
// comma and the state code. Returns nulls when parsing fails — partial data
// is fine for Meta CAPI (it just lowers EMQ contribution from those fields).
function parseUsAddress(addr: string | null | undefined): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!addr) return { city: null, state: null, zip: null };

  // ZIP: first 5-digit run (allows "90001-1234" — we keep just the 5)
  const zipMatch = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  // State: 2-letter uppercase code immediately before the ZIP
  let state: string | null = null;
  if (zipMatch) {
    const beforeZip = addr.slice(0, zipMatch.index).trimEnd();
    const stateMatch = beforeZip.match(/\b([A-Z]{2})\s*,?\s*$/);
    if (stateMatch) state = stateMatch[1];
  }

  // City: text between the LAST comma before the state and the state itself
  let city: string | null = null;
  if (state && zipMatch) {
    const beforeState = addr.slice(0, zipMatch.index).replace(/\s*,?\s*[A-Z]{2}\s*,?\s*$/, '');
    const lastComma = beforeState.lastIndexOf(',');
    if (lastComma >= 0) {
      city = beforeState.slice(lastComma + 1).trim();
    }
  }

  return { city, state, zip };
}

async function buildUserData(order: any) {
  const ud: Record<string, any> = {};

  // ── Hashed PII ──────────────────────────────────────────
  const em = await hashIf(norm.email(order.customer_email));
  if (em) ud.em = [em];

  const ph = await hashIf(norm.phone(order.customer_phone));
  if (ph) ud.ph = [ph];

  // Split full name into first + last
  if (order.customer_name) {
    const parts = order.customer_name.trim().split(/\s+/);
    const fn = await hashIf(norm.name(parts[0]));
    const ln = await hashIf(norm.name(parts.slice(1).join(" ")));
    if (fn) ud.fn = [fn];
    if (ln) ud.ln = [ln];
  }

  // ── Address (parsed from shipping_address free-text) ────
  // Real data analysis showed shipping_address follows US format ~90% of the
  // time. Adding ct/st/zp is the highest-EMQ-impact change since none of these
  // were being sent before, and Meta's matcher heavily weights geographic data.
  const parsed = parseUsAddress(order.shipping_address);
  const ct = await hashIf(norm.city(parsed.city));
  if (ct) ud.ct = [ct];

  const st = await hashIf(norm.state(parsed.state));
  if (st) ud.st = [st];

  const zp = await hashIf(norm.zip(parsed.zip));
  if (zp) ud.zp = [zp];

  // Country — fall back to 'us' when null because real data shows all web
  // orders are US (the country dropdown is only used for agent-created orders).
  const countryRaw = order.country || (parsed.zip ? 'us' : null);
  const cn = await hashIf(norm.country(countryRaw));
  if (cn) ud.country = [cn];

  // external_id — hashed customer email is the most stable customer identifier
  // (works across orders for repeat customers, and Meta uses this for Customer Match)
  const xid = await hashIf(norm.email(order.customer_email));
  if (xid) ud.external_id = [xid];

  // ── Raw (NEVER hashed) ──────────────────────────────────
  // attribution jsonb populated by pandapatches.com web checkout
  const attr = order.attribution || {};

  if (attr.fbp) ud.fbp = String(attr.fbp);
  if (attr.fbc) ud.fbc = String(attr.fbc);
  if (attr.client_ip || attr.ip) ud.client_ip_address = String(attr.client_ip || attr.ip);
  // Accept both `client_ua` (website's chosen field name) and the older
  // `user_agent`/`client_user_agent` keys for backward compatibility.
  const ua = attr.client_ua || attr.user_agent || attr.client_user_agent;
  if (ua) ud.client_user_agent = String(ua);

  return ud;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
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
    const { order_id, force } = bodySchema.parse(await req.json());

    // ── Fetch the order ──────────────────────────────────
    const { data: order, error } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (error || !order) throw new Error(`Order ${order_id} not found`);

    // ── Idempotency check ────────────────────────────────
    if (order.capi_purchase_sent && !force) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "already_sent", event_id: order.capi_purchase_event_id }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── Sanity check: customer must have committed at least SOMETHING ───
    // Deposit-aware: we fire on first payment with full order value.
    // (Industry standard for B2B custom-product / 10-30 day production.)
    if (order.amount_paid <= 0 || order.order_amount <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order has no payment yet" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (["CANCELLED", "REFUNDED"].includes(order.status)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Cancelled/refunded orders skip CAPI" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // ── Build the event ──────────────────────────────────
    const eventId = order.capi_purchase_event_id || `order_${order.id}_purchase`;
    const userData = await buildUserData(order);
    const hasBrowserContext = !!(userData.fbp || userData.fbc);
    // Detect Messenger/Instagram ad source — even without fbc, ad_id allows Meta
    // to credit the campaign. action_source must be 'business_messaging' for
    // Meta to properly attribute Messenger/Instagram conversations to ads.
    const attrSource = order.attribution?.source ?? '';
    const isFromMetaChat = attrSource === 'meta_messenger' || attrSource === 'meta_instagram';
    const adId = order.attribution?.ad_id ?? null;

    // Pick the most accurate action_source:
    //   - website (fbc/fbp present → user came from tracked website visit)
    //   - business_messaging (Messenger/Instagram conversation, with or without ad_id)
    //   - system_generated (no signals — agent-created, no marketing context)
    let actionSource: 'website' | 'business_messaging' | 'system_generated';
    if (hasBrowserContext) actionSource = 'website';
    else if (isFromMetaChat) actionSource = 'business_messaging';
    else actionSource = 'system_generated';

    const eventBody = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: actionSource,
          // event_source_url only meaningful when action_source=website
          event_source_url: hasBrowserContext
            ? (order.attribution?.event_source_url || "https://pandapatches.com")
            : undefined,
          // messaging_channel hint for Meta when action_source = business_messaging
          messaging_channel: isFromMetaChat
            ? (attrSource === 'meta_instagram' ? 'instagram' : 'messenger')
            : undefined,
          user_data: userData,
          custom_data: {
            currency: "USD",
            value: Number(order.order_amount),
            order_id: String(order.id),
            content_type: "product",
            content_ids: [String(order.order_number || `pp_${order.id}`)],
            content_name: order.design_name || order.patches_type || "Custom Patches",
            num_items: order.patches_quantity || 1,
            contents: [
              {
                id: String(order.order_number || `pp_${order.id}`),
                quantity: order.patches_quantity || 1,
                item_price: Number(order.order_amount) / Math.max(order.patches_quantity || 1, 1),
              },
            ],
            // Ad attribution — critical for Messenger/Instagram CTM ads
            // where ctwa_clid isn't available. ad_id lets Meta credit the campaign.
            ad_id: adId || undefined,
            payment_status_at_fire:
              order.amount_paid >= order.order_amount ? "fully_paid" : "deposit",
          },
        },
      ],
      ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };

    // ── Send to Meta ─────────────────────────────────────
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${META_TOKEN}`;
    const metaRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const metaJson = await metaRes.json();

    const success = metaRes.ok && !metaJson.error;

    // ── Persist response (always, success or failure) ────
    await admin
      .from("orders")
      .update({
        capi_purchase_event_id: eventId,
        capi_purchase_sent: success,
        capi_purchase_sent_at: success ? new Date().toISOString() : null,
        capi_purchase_response: metaJson,
      })
      .eq("id", order.id);

    if (!success) {
      console.error(
        `[CAPI] Purchase failed for order ${order.order_number}:`,
        JSON.stringify(metaJson)
      );
      return new Response(
        JSON.stringify({ ok: false, meta_response: metaJson, event_id: eventId }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 502 }
      );
    }

    console.log(
      `[CAPI] Purchase sent for order ${order.order_number} (event_id=${eventId}, action_source=${eventBody.data[0].action_source})`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        event_id: eventId,
        action_source: eventBody.data[0].action_source,
        meta_response: metaJson,
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
    console.error("[send-meta-purchase] error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
