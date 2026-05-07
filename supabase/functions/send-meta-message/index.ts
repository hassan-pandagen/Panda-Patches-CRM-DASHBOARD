// supabase/functions/send-meta-message/index.ts
// Sends an outbound message to a Messenger/Instagram conversation from the CRM.
//
// Flow:
//   1. Staff types reply in MetaChatPanel → frontend calls this function
//   2. We verify the caller is staff (admin or assigned sales agent)
//   3. POST to Meta Graph API /me/messages with PAGE_TOKEN
//   4. On success, save the outbound message to meta_messages with direction='outbound'
//   5. If conversation had no assignee, auto-assign it to the replying agent
//
// 24-hour messaging window:
//   Meta only allows freeform replies within 24h of the customer's last message.
//   After that, messages MUST include a `messaging_type` + `tag` (one of:
//     CONFIRMED_EVENT_UPDATE, POST_PURCHASE_UPDATE, ACCOUNT_UPDATE, HUMAN_AGENT)
//   The frontend selects the tag from a dropdown when replying after 24h.
//
// Rate limits:
//   Meta enforces ~200 msgs/sec per app, but per-page limits are stricter
//   (~40 msgs/sec). The frontend throttles user input to 250ms between sends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

const META_GRAPH_VERSION = "v25.0";

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

type MessageTag =
  | 'CONFIRMED_EVENT_UPDATE'
  | 'POST_PURCHASE_UPDATE'
  | 'ACCOUNT_UPDATE'
  | 'HUMAN_AGENT';

interface RequestBody {
  conversation_id: number;
  text: string;
  tag?: MessageTag; // required if 24h window has elapsed
}

function validateBody(raw: any): RequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Body must be a JSON object');
  if (!Number.isInteger(raw.conversation_id) || raw.conversation_id <= 0) {
    throw new Error('conversation_id must be a positive integer');
  }
  if (typeof raw.text !== 'string' || raw.text.trim().length === 0) {
    throw new Error('text must be a non-empty string');
  }
  if (raw.text.length > 2000) {
    throw new Error('text exceeds Meta 2000-char limit');
  }
  const allowedTags: MessageTag[] = [
    'CONFIRMED_EVENT_UPDATE', 'POST_PURCHASE_UPDATE', 'ACCOUNT_UPDATE', 'HUMAN_AGENT',
  ];
  let tag: MessageTag | undefined;
  if (raw.tag !== undefined && raw.tag !== null) {
    if (!allowedTags.includes(raw.tag)) {
      throw new Error(`tag must be one of: ${allowedTags.join(', ')}`);
    }
    tag = raw.tag;
  }
  return { conversation_id: raw.conversation_id, text: raw.text.trim(), tag };
}

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

    // ── Authenticate caller (staff only) ────────────────────────
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: staff } = await admin
      .from('user_profiles')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle();

    if (!staff) {
      return new Response(
        JSON.stringify({ error: 'Only staff can send Meta messages' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const { conversation_id, text, tag } = validateBody(await req.json());

    // ── Load conversation ───────────────────────────────────────
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, channel, meta_psid, meta_ig_id, assignee_user_id, customer_name, status')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) throw new Error('Conversation not found');

    const recipientId = conv.channel === 'instagram' ? conv.meta_ig_id : conv.meta_psid;
    if (!recipientId) {
      return new Response(
        JSON.stringify({ error: 'This conversation has no Meta PSID/IG ID' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Authorization: admin OR the assigned agent
    const isAdmin = staff.role === 'ADMIN';
    const isAssigned = conv.assignee_user_id === staff.id;

    if (!isAdmin && !isAssigned) {
      return new Response(
        JSON.stringify({ error: 'Only admin or assigned agent can reply' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // ── Check 24h window ────────────────────────────────────────
    const { data: lastInbound } = await admin
      .from('meta_messages')
      .select('received_at')
      .eq('conversation_id', conversation_id)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastInboundMs = lastInbound?.received_at ? new Date(lastInbound.received_at).getTime() : 0;
    const hoursSinceInbound = (Date.now() - lastInboundMs) / (1000 * 60 * 60);
    const insideWindow = hoursSinceInbound < 24 && lastInboundMs > 0;

    if (!insideWindow && !tag) {
      return new Response(
        JSON.stringify({
          error: 'Outside 24h window — message tag required',
          hours_since_last_inbound: Math.round(hoursSinceInbound),
          allowed_tags: [
            'POST_PURCHASE_UPDATE', 'CONFIRMED_EVENT_UPDATE', 'ACCOUNT_UPDATE', 'HUMAN_AGENT',
          ],
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // ── Build Meta Graph API payload ────────────────────────────
    const metaPayload: Record<string, any> = {
      recipient: { id: recipientId },
      message: { text },
    };

    if (insideWindow) {
      metaPayload.messaging_type = 'RESPONSE';
    } else {
      metaPayload.messaging_type = 'MESSAGE_TAG';
      metaPayload.tag = tag;
    }

    // ── POST to Meta ────────────────────────────────────────────
    const metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/messages?access_token=${PAGE_TOKEN}`;
    const metaRes = await fetch(metaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload),
    });
    const metaJson = await metaRes.json();

    if (!metaRes.ok || metaJson.error) {
      console.error('[send-meta-message] Meta API error:', metaJson);
      return new Response(
        JSON.stringify({
          error: metaJson.error?.message || `Meta returned ${metaRes.status}`,
          meta_error_code: metaJson.error?.code,
          meta_error_subcode: metaJson.error?.error_subcode,
        }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const sentAt = new Date().toISOString();

    // ── Persist outbound message ────────────────────────────────
    await admin.from('meta_messages').insert({
      conversation_id,
      direction: 'outbound',
      channel: conv.channel,
      meta_message_id: metaJson.message_id ?? null,
      text,
      attachments: null,
      received_at: sentAt,
      sender_user_id: staff.id,
      sender_email: staff.email,
    });

    // ── Auto-claim: assign conversation to first replier if unassigned ──
    if (!conv.assignee_user_id) {
      await admin
        .from('conversations')
        .update({ assignee_user_id: staff.id, updated_at: sentAt })
        .eq('id', conversation_id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message_id: metaJson.message_id,
        recipient_id: metaJson.recipient_id,
        used_tag: !insideWindow ? tag : null,
        auto_claimed: !conv.assignee_user_id,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    console.error('[send-meta-message] error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
