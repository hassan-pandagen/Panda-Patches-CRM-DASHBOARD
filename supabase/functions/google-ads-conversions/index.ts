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
//
// ⚠️ LEGACY UPLOAD PATH DEPRECATED (2026-07-15) — see claude-code-task-datamanager-migration.md.
// This account is NOT allowlisted for `ConversionUploadService.UploadClickConversions`
// (Google stopped accepting new adopters 2026-06-15; verified live — see
// `google_ads_upload_log`, error `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`). There is no
// allowlisting path for this account. The Ads-API-version bump (v19→v22, still below) fixed
// the earlier dead-endpoint bug but does NOT fix this — it's an account eligibility wall, not
// a version issue. The mandated replacement is Google Data Manager (a scheduled Sheet
// connection, config not code). Until that Sheets-export path is wired in, this function is a
// documented no-op: it computes what it would have sent, then logs 'SKIPPED' and returns —
// no network call to Google Ads, no more silent FAILED/rejected spam. Kept intact (not
// deleted) so the reasoning + the match-key logic (gclid / hashed email+phone) stay visible
// and reusable for the Data Manager Sheets writer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

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

// Exact Google Ads conversion action names — must match verbatim for Data Manager's
// "Conversion Name" column mapping (see claude-code-task-datamanager-migration.md §3).
const CONVERSION_NAME: Record<'LEAD' | 'ORDER', string> = {
  LEAD: 'Quote Submitted (CRM)',
  ORDER: 'Quote Converted to Order (CRM)',
};

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
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env vars not configured');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json(); // Supabase Database Webhook: { type, table, record, old_record }

    const q = payload.record;
    const isConversion = payload.type === 'UPDATE' && q?.converted_at && !payload.old_record?.converted_at;
    const isNewLead = payload.type === 'INSERT';

    if (!isNewLead && !isConversion) {
      return new Response(JSON.stringify({ received: true, skipped: 'not a lead or conversion event' }), { status: 200 });
    }

    const eventType: 'LEAD' | 'ORDER' = isConversion ? 'ORDER' : 'LEAD';

    // Idempotency: skip if we've already exported this quote + event type (SUCCESS will mean
    // "written to the Data Manager Sheet" once that path is built). Google itself also dedupes
    // on `orderId`, so this remains defense-in-depth for whatever the eventual sink is.
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

    // This shape is the future Data Manager Sheet row (Conversion Name / Time / Value /
    // Currency / Order ID + gclid or hashed identifiers below) — kept as-is from the old
    // Ads-API payload so the Sheets writer can reuse it directly.
    const conversion: Record<string, unknown> = {
      conversionName: CONVERSION_NAME[eventType],
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

    // DEPRECATED LEGACY PATH — no network call to Google Ads (see header comment). Logs
    // exactly the row that WOULD be sent, so the Data Manager Sheets writer (next phase) can
    // query `google_ads_upload_log` for reason='legacy_endpoint_deprecated_pending_data_manager_migration'
    // to see/backfill the real export backlog. Never store raw email/phone — only hashed
    // values (already what `conversion` contains) plus click-id presence flags.
    const hadClickId = !!(conversion.gclid || conversion.wbraid || conversion.gbraid);
    const hadUserIdentifiers = userIdentifiers.length > 0;

    await admin.from('google_ads_upload_log').insert({
      quote_id: q.id,
      event_type: eventType,
      status: 'SKIPPED',
      response: {
        reason: hadClickId || hadUserIdentifiers
          ? 'legacy_endpoint_deprecated_pending_data_manager_migration'
          : 'no click id or user identifiers',
        hadClickId,
        hadUserIdentifiers,
        wouldHaveSent: conversion,
      },
    });

    console.log(`[google-ads-conversions] quote ${q.quote_number} (${eventType}): legacy path deprecated, logged for Data Manager backfill`);

    return new Response(JSON.stringify({ received: true, skipped: 'legacy_endpoint_deprecated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[google-ads-conversions] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
