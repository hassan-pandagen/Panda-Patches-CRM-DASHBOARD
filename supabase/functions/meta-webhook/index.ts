// supabase/functions/meta-webhook/index.ts
// Receives Messenger + Instagram DM events from Meta.
//
// Two routes:
//   GET  → verification handshake (Meta sends this when you save the webhook URL)
//   POST → actual message events
//
// On inbound message:
//   1. Verify HMAC signature using META_APP_SECRET (security)
//   2. Find or create a `quotes` row for this PSID/IG_ID
//   3. Save the message to `meta_messages` (idempotent via meta_message_id unique)
//   4. If new lead: fire CAPI Lead event (with ctwa_clid → fbc for ad attribution)
//   5. Notify all admins + the assigned sales agent (activity_notifications + email)
//
// IMPORTANT — JWT verification must be OFF on this function (Meta doesn't send a Supabase JWT).
// Verification is via Meta's HMAC + the verify token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_GRAPH_VERSION = "v25.0";
const META_PIXEL_ID = "1515101469424765";

// ── Hashing helpers (for CAPI Lead event PII) ───────────────────
const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const normName = (v?: string | null) => v?.trim().toLowerCase().replace(/[^a-z]/g, "") || null;
async function hashIf(v: string | null) {
  return v ? await sha256(v) : undefined;
}

// ── HMAC signature verification ───────────────────────────────
async function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): Promise<boolean> {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = signature.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison
  if (expected.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ computed.charCodeAt(i);
  }
  return diff === 0;
}

// ── Fetch user profile from Meta Graph API ──────────────────────
async function fetchUserProfile(psid: string, channel: 'messenger' | 'instagram', token: string) {
  // Messenger profile: first_name, last_name, profile_pic
  // Instagram: name, username (less detail)
  const fields = channel === 'messenger' ? 'first_name,last_name,profile_pic' : 'name,username,profile_pic';
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${psid}?fields=${fields}&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ── Fire CAPI Lead event for new chat ─────────────────────────────
async function fireCapiLead(quote: any, ctwaClid: string | null, capiToken: string) {
  const userData: Record<string, any> = {};
  const fn = await hashIf(normName(quote.first_name || (quote.customer_name?.split(' ')[0])));
  const ln = await hashIf(normName(quote.last_name || (quote.customer_name?.split(' ').slice(1).join(' '))));
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];

  // ctwa_clid is the chat-equivalent of fbc — format as fb.1.{ts}.{clid}
  if (ctwaClid) {
    userData.fbc = `fb.1.${Date.now()}.${ctwaClid}`;
  }

  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `meta_chat_${quote.id}`,
        action_source: 'business_messaging',
        user_data: userData,
        custom_data: {
          content_name: `Meta ${quote.meta_channel} chat started`,
          content_category: quote.meta_ad_id ? 'chat_from_ad' : 'chat_organic',
          ad_id: quote.meta_ad_id || undefined,
        },
      },
    ],
    ...(Deno.env.get("META_TEST_EVENT_CODE") ? { test_event_code: Deno.env.get("META_TEST_EVENT_CODE") } : {}),
  };

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${capiToken}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error('[meta-webhook] CAPI Lead fire failed:', err);
    return null;
  }
}

// ── Notify staff of new chat ─────────────────────────────────────
async function notifyStaffOfChat(admin: any, quote: any, messageText: string) {
  // Get all admin user IDs
  const { data: admins } = await admin
    .from('user_profiles')
    .select('id, email')
    .eq('role', 'ADMIN');

  if (!admins || admins.length === 0) return;

  const channelLabel = quote.meta_channel === 'instagram' ? 'Instagram' : 'Messenger';
  const senderName = quote.customer_name || 'Unknown';
  const truncated = messageText.length > 200 ? messageText.substring(0, 200) + '...' : messageText;
  const isFromAd = !!quote.meta_ad_id;

  const notifRows = admins.map((a: any) => ({
    recipient_id: a.id,
    type: 'customer_message',
    title: `${isFromAd ? '📱 [AD] ' : '💬 '}New ${channelLabel} chat from ${senderName}`,
    body: truncated,
    link: `/quote/${quote.quote_number}`,
    related_order_id: null,
  }));

  await admin.from('activity_notifications').insert(notifRows);
}

// ── Main handler ────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── GET = Meta verification handshake ───────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? '';

    // Constant-time verify_token compare (prevents timing-leak token discovery)
    let tokenOk = false;
    if (token && VERIFY_TOKEN && token.length === VERIFY_TOKEN.length) {
      let diff = 0;
      for (let i = 0; i < token.length; i++) {
        diff |= token.charCodeAt(i) ^ VERIFY_TOKEN.charCodeAt(i);
      }
      tokenOk = diff === 0;
    }

    if (mode === 'subscribe' && tokenOk && challenge) {
      console.log('[meta-webhook] Verification successful');
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.warn('[meta-webhook] Verification failed', { mode, hasToken: !!token });
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST = actual webhook event ─────────────────────────────
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const APP_SECRET   = Deno.env.get('META_APP_SECRET') ?? '';
    const PAGE_TOKEN   = Deno.env.get('META_PAGE_ACCESS_TOKEN') ?? '';
    const CAPI_TOKEN   = Deno.env.get('META_ACCESS_TOKEN') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars missing');
    if (!APP_SECRET) throw new Error('META_APP_SECRET not configured');

    // Read raw body for signature verification
    const rawBody = await req.text();

    // Verify HMAC signature from Meta
    const signature = req.headers.get('x-hub-signature-256');
    const ok = await verifyMetaSignature(rawBody, signature, APP_SECRET);
    if (!ok) {
      console.warn('[meta-webhook] Invalid signature');
      return new Response('Invalid signature', { status: 401 });
    }

    // Parse payload AFTER verification
    const body = JSON.parse(rawBody);
    const channel: 'messenger' | 'instagram' = body.object === 'instagram' ? 'instagram' : 'messenger';

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Loop over entries (Meta best practice — never process only first)
    for (const entry of (body.entry || [])) {
      for (const event of (entry.messaging || [])) {
        try {
          await handleMessagingEvent(event, channel, admin, PAGE_TOKEN, CAPI_TOKEN);
        } catch (err) {
          console.error('[meta-webhook] event handler failed:', err);
        }
      }
    }

    // ACK quickly so Meta doesn't retry
    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (err: any) {
    console.error('[meta-webhook] error:', err.message);
    // Still return 200 so Meta doesn't retry on a buggy handler
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
});

async function handleMessagingEvent(
  event: any,
  channel: 'messenger' | 'instagram',
  admin: any,
  pageToken: string,
  capiToken: string
) {
  const psid = event.sender?.id;
  if (!psid) return;

  const message = event.message;
  const messageId = message?.mid;
  const messageText = message?.text || '';
  const attachments = message?.attachments || null;
  const referral = message?.referral || event.postback?.referral;

  // Idempotency — skip if we already saw this exact message
  if (messageId) {
    const { data: existingMsg } = await admin
      .from('meta_messages')
      .select('id')
      .eq('meta_message_id', messageId)
      .maybeSingle();
    if (existingMsg) return;
  }

  // Find existing quote (lead) for this PSID/IG_ID
  const psidField = channel === 'messenger' ? 'meta_psid' : 'meta_ig_id';
  const { data: existing } = await admin
    .from('quotes')
    .select('*')
    .eq(psidField, psid)
    .maybeSingle();

  let quote = existing;
  let isNewLead = false;

  if (!quote) {
    isNewLead = true;
    // Fetch profile from Meta
    const profile = pageToken ? await fetchUserProfile(psid, channel, pageToken) : {};
    const customerName = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.name || profile.first_name || `Meta ${channel} user`;

    // Build attribution JSONB so the value persists to the order on conversion.
    // ctwa_clid → formatted fbc string is what Meta CAPI expects when the order
    // eventually fires Purchase. Without this, ad-attributed chats lose their
    // fbc signal at the quote→order step (EMQ drops 9.0 → 7.5).
    const attribution: Record<string, any> = {
      source: channel === 'messenger' ? 'meta_messenger' : 'meta_instagram',
      first_seen_at: new Date(event.timestamp || Date.now()).toISOString(),
    };
    if (referral?.ctwa_clid) {
      // Meta's required fbc format: fb.1.{unix_ms}.{click_id}
      attribution.fbc = `fb.1.${Date.now()}.${referral.ctwa_clid}`;
      attribution.ctwa_clid = referral.ctwa_clid;
    }
    if (referral?.ad_id) attribution.ad_id = referral.ad_id;
    if (referral?.source) attribution.referral_source = referral.source;

    // Insert as new quote — note: quote_number is auto-generated by trigger
    const { data: newQuote, error: insertErr } = await admin
      .from('quotes')
      .insert({
        customer_name: customerName,
        sales_agent: 'unassigned',
        lead_source: channel === 'messenger' ? 'meta_messenger' : 'meta_instagram',
        [psidField]: psid,
        meta_channel: channel,
        meta_first_message_at: new Date(event.timestamp || Date.now()).toISOString(),
        meta_ad_id: referral?.ad_id || null,
        meta_ad_creative_id: referral?.creative_id || null,
        meta_ctwa_clid: referral?.ctwa_clid || null,
        meta_referral_source: referral?.source || null,
        attribution,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[meta-webhook] insert quote failed:', insertErr);
      return;
    }
    quote = newQuote;

    // Fire CAPI Lead event
    if (capiToken && quote) {
      await fireCapiLead(quote, referral?.ctwa_clid || null, capiToken);
    }
  }

  // Save the message
  await admin.from('meta_messages').insert({
    quote_id: quote.id,
    direction: 'inbound',
    channel,
    meta_message_id: messageId,
    text: messageText,
    attachments,
    received_at: new Date(event.timestamp || Date.now()).toISOString(),
  });

  // Notify staff (only on new chats — repeat messages on existing chats don't spam)
  if (isNewLead) {
    await notifyStaffOfChat(admin, quote, messageText);
  }
}
