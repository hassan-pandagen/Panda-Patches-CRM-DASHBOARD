// supabase/functions/google-ads-conversions/index.ts
// Uploads Google Ads offline conversions (leads + purchases) from `quotes` INSERT/UPDATE
// events, mirroring the existing Meta CAPI pipeline. Triggered by Supabase Database Webhooks
// on the `quotes` table (INSERT and UPDATE) — configured in the Supabase Dashboard, not here.
//
// Two events:
//   LEAD  — quotes INSERT -> "Quote Submitted (CRM)" conversion action
//   ORDER — quotes UPDATE where converted_at transitions null -> set -> "Quote Converted to
//           Order (CRM)" conversion action, conversion_value = quote_amount (fallback estimated_amount)
//
// Security: JWT verification ENABLED (verify_jwt: true). The Database Webhook must be
// configured with an "Authorization: Bearer <service_role_key>" header in the Dashboard.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const GADS_API_VERSION = 'v19'; // check https://developers.google.com/google-ads/api/docs/release-notes for latest

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const normEmail = (e: string) => e.trim().toLowerCase();

const normPhone = (p: string) => {
  const digits = p.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : '+1' + digits.replace(/^1/, ''); // E.164, default US
};

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GADS_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GADS_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GADS_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}

// Google rejects a click id older than 90 days; past that window (or if we can't tell the age
// at all) we drop the click id and rely on hashed user identifiers (Enhanced Conversions)
// instead. A missing timestamp is treated as "unusable", not "assume it's fine" — we'd rather
// under-send a click id than submit one Google is likely to reject.
const GCLICK_MAX_AGE_DAYS = 90;

function isClickUsable(capturedAtIso: string | undefined | null): boolean {
  if (!capturedAtIso) return false;
  const capturedMs = new Date(capturedAtIso).getTime();
  if (Number.isNaN(capturedMs)) return false;
  const ageMs = Date.now() - capturedMs;
  return ageMs >= 0 && ageMs <= GCLICK_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const GADS_CUSTOMER_ID = Deno.env.get('GADS_CUSTOMER_ID') ?? '';
    const GADS_DEVELOPER_TOKEN = Deno.env.get('GADS_DEVELOPER_TOKEN') ?? '';
    const GADS_ACTION_ID_LEAD = Deno.env.get('GADS_ACTION_ID_LEAD') ?? '';
    const GADS_ACTION_ID_ORDER = Deno.env.get('GADS_ACTION_ID_ORDER') ?? '';
    // Manager (MCC) account ID. When the ad account (GADS_CUSTOMER_ID) is accessed through a
    // manager account, Google requires the login-customer-id header or the call is rejected
    // with USER_PERMISSION_DENIED. Optional — leave unset for a standalone (non-MCC) account.
    const GADS_LOGIN_CUSTOMER_ID = Deno.env.get('GADS_LOGIN_CUSTOMER_ID') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');
    if (!GADS_CUSTOMER_ID || !GADS_DEVELOPER_TOKEN) throw new Error('Google Ads env vars not configured');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json(); // Supabase Database Webhook: { type, table, record, old_record }

    const q = payload.record;
    const isConversion = payload.type === 'UPDATE' && q?.converted_at && !payload.old_record?.converted_at;
    const isNewLead = payload.type === 'INSERT';

    if (!isNewLead && !isConversion) {
      return new Response(JSON.stringify({ received: true, skipped: 'not a lead or conversion event' }), { status: 200 });
    }

    const eventType = isConversion ? 'ORDER' : 'LEAD';
    const actionId = isConversion ? GADS_ACTION_ID_ORDER : GADS_ACTION_ID_LEAD;
    if (!actionId) {
      console.error(`[google-ads-conversions] missing conversion action id for ${eventType}`);
      return new Response(JSON.stringify({ received: true, error: 'missing conversion action id' }), { status: 200 });
    }

    // Idempotency: skip if we've already SUCCEEDED for this quote + event type. FAILED attempts
    // are not blocked here — a later retry (Supabase resends failed webhook deliveries) can
    // still succeed. Google itself also dedupes on `orderId`, so this is defense-in-depth.
    const { data: existing } = await admin
      .from('google_ads_upload_log')
      .select('id')
      .eq('quote_id', q.id)
      .eq('event_type', eventType)
      .eq('status', 'SUCCESS')
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ received: true, skipped: 'already uploaded' }), { status: 200 });
    }

    const attr = q.attribution ?? {};

    // Google wants "yyyy-mm-dd hh:mm:ss+00:00"
    const rawTs = isConversion ? q.converted_at : q.created_at;
    const conversionDateTime = String(rawTs).replace('T', ' ').replace(/\.\d+/, '').replace('Z', '+00:00');

    const conversion: Record<string, unknown> = {
      conversionAction: `customers/${GADS_CUSTOMER_ID}/conversionActions/${actionId}`,
      conversionDateTime,
      conversionValue: isConversion ? Number(q.quote_amount ?? q.estimated_amount ?? 0) : 0,
      currencyCode: 'USD',
      orderId: isConversion ? String(q.converted_order_id ?? q.quote_number) : String(q.quote_number),
    };

    // Prefer a click id; fall back to hashed user identifiers (Enhanced Conversions) if the
    // click is missing, too old, or has no verifiable capture time.
    if (isClickUsable(attr.gclid_captured_at)) {
      if (attr.gclid) conversion.gclid = attr.gclid;
      else if (attr.wbraid) conversion.wbraid = attr.wbraid;
      else if (attr.gbraid) conversion.gbraid = attr.gbraid;
    }

    const userIdentifiers: Record<string, string>[] = [];
    if (q.customer_email) userIdentifiers.push({ hashedEmail: await sha256(normEmail(q.customer_email)) });
    if (q.customer_phone) userIdentifiers.push({ hashedPhoneNumber: await sha256(normPhone(q.customer_phone)) });
    if (userIdentifiers.length > 0) conversion.userIdentifiers = userIdentifiers;

    if (!conversion.gclid && !conversion.wbraid && !conversion.gbraid && userIdentifiers.length === 0) {
      await admin.from('google_ads_upload_log').insert({
        quote_id: q.id, event_type: eventType, status: 'SKIPPED',
        response: { reason: 'no click id or user identifiers' },
      });
      return new Response(JSON.stringify({ received: true, skipped: 'no identifiers' }), { status: 200 });
    }

    const token = await getAccessToken();
    const gadsHeaders: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'developer-token': GADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json',
    };
    if (GADS_LOGIN_CUSTOMER_ID) gadsHeaders['login-customer-id'] = GADS_LOGIN_CUSTOMER_ID;

    const res = await fetch(
      `https://googleads.googleapis.com/${GADS_API_VERSION}/customers/${GADS_CUSTOMER_ID}:uploadClickConversions`,
      {
        method: 'POST',
        headers: gadsHeaders,
        body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
      }
    );

    const responseBody = await res.json().catch(() => ({}));

    // With partialFailure:true, Google returns HTTP 200 even when the conversion itself was
    // REJECTED — the actual outcome lives in `partialFailureError` in the body, not the status
    // code. Checking res.ok alone would silently log a rejected conversion as SUCCESS, which
    // would then block any future retry via the idempotency check above.
    const rejected = !!responseBody?.partialFailureError;
    const uploadSucceeded = res.ok && !rejected;

    // Never store raw email/phone — only hashed values (already what `conversion` contains)
    // plus click-id presence flags, so the log itself can't leak PII even if compromised.
    await admin.from('google_ads_upload_log').insert({
      quote_id: q.id,
      event_type: eventType,
      status: uploadSucceeded ? 'SUCCESS' : 'FAILED',
      response: {
        httpStatus: res.status,
        rejected,
        hadClickId: !!(conversion.gclid || conversion.wbraid || conversion.gbraid),
        hadUserIdentifiers: userIdentifiers.length > 0,
        googleResponse: responseBody,
      },
    });

    console.log(`[google-ads-conversions] quote ${q.quote_number} (${eventType}): http=${res.status} rejected=${rejected}`);

    return new Response(JSON.stringify({ received: true, status: res.status, rejected }), {
      status: uploadSucceeded ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[google-ads-conversions] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
