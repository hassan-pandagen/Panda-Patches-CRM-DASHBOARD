// supabase/functions/store-attribution/index.ts
// Called by the customer portal order page on load.
// Captures fbp/fbc/UA from the browser and IP from the request headers,
// then merges them into orders.attribution so the payment webhook
// has browser signals available when firing the CAPI Purchase event.
//
// Idempotent: only writes fields that aren't already set — never overwrites
// existing fbc/fbp (those would have come from a real ad click and are better).
//
// Called from: CustomerOrderDetail.tsx on mount (fire-and-forget fetch)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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

const bodySchema = z.object({
  order_number: z.string().min(1),
  fbp:          z.string().optional().nullable(),
  fbc:          z.string().optional().nullable(),
  // client_ua sent from browser navigator.userAgent
  client_ua:    z.string().optional().nullable(),
  // page_url is window.location.href
  page_url:     z.string().optional().nullable(),
  // referrer is document.referrer
  referrer:     z.string().optional().nullable(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body  = bodySchema.parse(await req.json());

    // Capture real client IP from Cloudflare/reverse-proxy headers
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;

    // Fetch current attribution so we never overwrite better existing signals
    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, attribution")
      .eq("order_number", body.order_number)
      .single();

    if (fetchErr || !order) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const existing = (order.attribution as Record<string, any>) || {};

    // Merge: only fill gaps — don't overwrite existing ad-click signals
    const merged: Record<string, any> = { ...existing };
    if (!merged.fbp       && body.fbp)      merged.fbp       = body.fbp;
    if (!merged.fbc       && body.fbc)      merged.fbc       = body.fbc;
    if (!merged.client_ip && clientIp)      merged.client_ip = clientIp;
    if (!merged.client_ua && body.client_ua) merged.client_ua = body.client_ua;
    if (!merged.page_url  && body.page_url) merged.page_url  = body.page_url;
    if (!merged.referrer  && body.referrer) merged.referrer  = body.referrer;
    if (!merged.first_seen_at)              merged.first_seen_at = new Date().toISOString();

    // Detect if customer arrived from a Meta ad (fbclid in page_url)
    if (!merged.source && body.page_url) {
      try {
        const url = new URL(body.page_url);
        const fbclid = url.searchParams.get("fbclid");
        if (fbclid) {
          merged.source = "meta_ad_click";
          // Build fbc from fbclid if not already present
          if (!merged.fbc) {
            merged.fbc = `fb.1.${Date.now()}.${fbclid}`;
          }
        }
      } catch { /* ignore invalid URL */ }
    }

    await admin
      .from("orders")
      .update({ attribution: merged })
      .eq("id", order.id);

    console.log(`[store-attribution] order ${body.order_number}: fbp=${!!merged.fbp}, fbc=${!!merged.fbc}, ip=${!!merged.client_ip}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: err.errors }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    console.error("[store-attribution] error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
