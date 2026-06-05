// supabase/functions/store-attribution-token/index.ts
// Stores fbp/fbc/IP/UA against a payment_form_token when the customer opens the form page.
// Called fire-and-forget from PaymentFormLandingPage on mount.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

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
  token:     z.string().uuid(),
  fbp:       z.string().optional().nullable(),
  fbc:       z.string().optional().nullable(),
  client_ua: z.string().optional().nullable(),
  page_url:  z.string().optional().nullable(),
  referrer:  z.string().optional().nullable(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body  = bodySchema.parse(await req.json());

    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const { data: tokenRow, error: fetchErr } = await admin
      .from("payment_form_tokens")
      .select("id, attribution")
      .eq("token", body.token)
      .single();

    if (fetchErr || !tokenRow) {
      return new Response(JSON.stringify({ ok: false, error: "Token not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const existing = (tokenRow.attribution as Record<string, any>) || {};
    const merged: Record<string, any> = { ...existing };

    if (!merged.fbp       && body.fbp)       merged.fbp       = body.fbp;
    if (!merged.fbc       && body.fbc)       merged.fbc       = body.fbc;
    if (!merged.client_ip && clientIp)       merged.client_ip = clientIp;
    if (!merged.client_ua && body.client_ua) merged.client_ua = body.client_ua;
    if (!merged.page_url  && body.page_url)  merged.page_url  = body.page_url;
    if (!merged.referrer  && body.referrer)  merged.referrer  = body.referrer;
    if (!merged.first_seen_at)               merged.first_seen_at = new Date().toISOString();

    // Build fbc from fbclid in URL if present
    if (!merged.fbc && body.page_url) {
      try {
        const fbclid = new URL(body.page_url).searchParams.get("fbclid");
        if (fbclid) {
          merged.fbc = `fb.1.${Date.now()}.${fbclid}`;
          merged.source = "meta_ad_click";
        }
      } catch { /* ignore */ }
    }

    await admin.from("payment_form_tokens")
      .update({ attribution: merged })
      .eq("id", tokenRow.id);

    console.log(`[store-attribution-token] token ${body.token}: fbp=${!!merged.fbp}, fbc=${!!merged.fbc}, ip=${!!merged.client_ip}`);

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (err: any) {
    if (err?.name === "ZodError") {
      return new Response(JSON.stringify({ error: "Validation failed", details: err.errors }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    console.error("[store-attribution-token] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
