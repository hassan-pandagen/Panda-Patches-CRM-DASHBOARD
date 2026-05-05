// supabase/functions/meta-admin/index.ts
// Admin-only utility endpoint for managing/diagnosing the Meta integration.
//
// Actions (POST body: { action: string, ... }):
//   - "check_subscriptions"  → GET /me/subscribed_apps — what fields is our app subscribed to on the page?
//   - "subscribe_page"       → POST /me/subscribed_apps — subscribe the page with our 4 fields
//   - "unsubscribe_page"     → DELETE /me/subscribed_apps — disconnect (reset) the page
//   - "page_info"            → GET /me — basic page info (name, id, etc) so admin can confirm the right page is connected
//
// Why a dedicated function instead of running curl?
//   - PAGE_TOKEN stays server-side (never reaches browser)
//   - Admin can self-diagnose without needing terminal access
//   - Audit trail in edge function logs
//
// Auth: staff with role=ADMIN only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

const META_GRAPH_VERSION = "v25.0";
const SUBSCRIBED_FIELDS = "messages,messaging_postbacks,messaging_referrals,message_deliveries";

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

type Action = 'check_subscriptions' | 'subscribe_page' | 'unsubscribe_page' | 'page_info';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const PAGE_TOKEN   = Deno.env.get('META_PAGE_ACCESS_TOKEN') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars missing');
    if (!PAGE_TOKEN) throw new Error('META_PAGE_ACCESS_TOKEN not configured');

    // Manual JWT decode (gateway already verified)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    let userId: string;
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
      if (!userId) throw new Error('No sub claim');
    } catch {
      throw new Error('Invalid JWT format');
    }

    // Admin-only
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: staff } = await admin
      .from('user_profiles')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (!staff || staff.role !== 'ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Admin only' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action: Action = body.action;

    let metaUrl = '';
    let metaMethod = 'GET';

    switch (action) {
      case 'check_subscriptions':
        metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/subscribed_apps?access_token=${PAGE_TOKEN}`;
        metaMethod = 'GET';
        break;
      case 'subscribe_page':
        metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}&access_token=${PAGE_TOKEN}`;
        metaMethod = 'POST';
        break;
      case 'unsubscribe_page':
        metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/subscribed_apps?access_token=${PAGE_TOKEN}`;
        metaMethod = 'DELETE';
        break;
      case 'page_info':
        metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name,username,fan_count,category&access_token=${PAGE_TOKEN}`;
        metaMethod = 'GET';
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Allowed: check_subscriptions, subscribe_page, unsubscribe_page, page_info` }),
          { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    const metaRes = await fetch(metaUrl, { method: metaMethod });
    const metaJson = await metaRes.json();

    return new Response(
      JSON.stringify({
        action,
        ok: metaRes.ok && !metaJson.error,
        meta_response: metaJson,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    console.error('[meta-admin] error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
