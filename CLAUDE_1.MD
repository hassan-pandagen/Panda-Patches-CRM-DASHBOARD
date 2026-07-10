# Claude Code Prompt: Google Ads Conversion Tracking (CAPI-equivalent) for Panda Patches

Copy everything below into Claude Code from the website repo (and CRM/Supabase repo if separate).

---

## PROMPT

Implement Google Ads offline conversion tracking for pandapatches.com, mirroring our existing Meta CAPI pipeline. Google Ads currently receives ZERO conversion data — the attribution script only captures Meta identifiers.

### Verified current state (audited 2026-07-07, do not re-verify, just locate the code)

**Website** (Next.js, www.pandapatches.com, GTM container `GTM-KQQQ674D`, GA4 present):
- An attribution script stores a JSON object in `localStorage` under key **`pp_attribution_v1`** with keys: `first_seen_at`, `fbp`, `fbc`, `page_url`, `referrer`. It reads `_fbp`/`_fbc` cookies. It does NOT capture `gclid`, `wbraid`, or `gbraid`.
- A second localStorage key `trafficSource` stores `{source, medium, campaign, landingPage, timestamp, fullUrl}`.
- The homepage quote form has fields: `website` (honeypot), `name`, `email`, `phone`, `quantity`, `size`, `type`, `backing`, `hearAbout`, `instructions`. No hidden attribution fields — attribution is merged into the submit payload from localStorage.
- Quote submissions land in Supabase table `quotes` (project `uxgzlneefybifvccfhwp`).

**CRM** (portal.pandapatches.com, Supabase-backed):
- `quotes` table columns include: `id`, `quote_number`, `customer_name`, `customer_email`, `customer_phone`, `patches_quantity`, `patches_type`, `estimated_amount`, `quote_amount`, `sales_agent`, `lead_source`, `created_at`, `attribution` (jsonb), `meta_psid`, `meta_ad_id`, `meta_ctwa_clid`, `converted_at`, `converted_order_id`.
- `attribution` jsonb currently holds keys like: `fbc`, `fbp`, `fbclid`, `page_url`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `client_ip`, `client_ua`, `form_name`, `traffic_source`.

**Google Ads** (customer ID `894-744-0123` → API format `8947440123`):
- 11 conversion actions; 8 flagged "Misconfigured" (tag not firing), 0 conversions recorded in 30 days.

### Task 1 — Capture Google click IDs on the website

In the module that builds `pp_attribution_v1` (search the codebase for `pp_attribution_v1`), add Google click ID capture alongside the existing fbp/fbc logic:

```js
function getGoogleClickIds() {
  const p = new URLSearchParams(window.location.search);
  const ids = {
    gclid: p.get('gclid') || null,
    wbraid: p.get('wbraid') || null,   // iOS web-to-app
    gbraid: p.get('gbraid') || null,   // iOS app-to-web
  };
  // Fallback: Google tag stores the last click in the _gcl_aw / _gcl_gb cookies
  // Format: GCL.<timestamp>.<clickId>
  if (!ids.gclid) {
    const m = document.cookie.match(/(?:^|;\s*)_gcl_aw=GCL\.\d+\.([^;]+)/);
    if (m) ids.gclid = m[1];
  }
  if (!ids.gbraid) {
    const m = document.cookie.match(/(?:^|;\s*)_gcl_gb=GCL\.\d+\.([^;]+)/);
    if (m) ids.gbraid = m[1];
  }
  return ids;
}
```

Requirements:
- Persist non-null values into `pp_attribution_v1` on first page load (same pattern as fbc: URL param wins over cookie, never overwrite an existing stored gclid with null; DO overwrite with a newer non-null one).
- Add `gclid_captured_at` ISO timestamp when a gclid/wbraid/gbraid is stored (Google rejects uploads where the click is > 90 days old; conversion time must be AFTER click time).
- Merge these keys into the quote-form submit payload exactly like fbp/fbc, so they end up in `quotes.attribution`.

### Task 2 — Fire the on-site conversion tag (fixes "Misconfigured")

On successful quote-form submit, push to dataLayer (GTM `GTM-KQQQ674D` handles the rest):

```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: 'quote_form_submit',
  user_data: {            // for Enhanced Conversions via GTM
    email: formData.email,
    phone_number: formData.phone,
  },
});
```

Note in the PR description that a human must, in GTM: (1) add a Google Ads Conversion Tracking tag triggered on `quote_form_submit` for the existing "Quote Form Sub" conversion action, (2) enable Enhanced Conversions on it using the `user_data` dataLayer variable, (3) publish. Claude Code cannot do the GTM UI part.

### Task 3 — Supabase Edge Function: upload conversions to Google Ads

Create edge function `google-ads-conversions` that handles two events via Supabase Database Webhooks:

1. **INSERT on `quotes`** → upload conversion action `Quote Submitted (CRM)`
2. **UPDATE on `quotes` where `converted_at` transitions from null → set** → upload `Quote Converted to Order (CRM)` with `conversion_value = quote_amount` (fallback `estimated_amount`, currency USD)

Implementation (Deno/TypeScript):

```ts
// supabase/functions/google-ads-conversions/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GADS_CUSTOMER_ID = '8947440123';
const API_VERSION = 'v19'; // check latest at implementation time

// --- helpers -------------------------------------------------------------
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
      client_id: Deno.env.get('GADS_CLIENT_ID')!,
      client_secret: Deno.env.get('GADS_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GADS_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  return j.access_token;
}

// --- main ----------------------------------------------------------------
serve(async (req) => {
  const payload = await req.json(); // Supabase webhook: { type, record, old_record }
  const q = payload.record;
  const isConversion =
    payload.type === 'UPDATE' && q.converted_at && !payload.old_record?.converted_at;
  const isNewLead = payload.type === 'INSERT';
  if (!isNewLead && !isConversion) return new Response('ignored', { status: 200 });

  const attr = q.attribution ?? {};
  const actionId = isConversion
    ? Deno.env.get('GADS_ACTION_ID_ORDER')!   // "Quote Converted to Order (CRM)"
    : Deno.env.get('GADS_ACTION_ID_LEAD')!;   // "Quote Submitted (CRM)"

  // Google wants "yyyy-mm-dd hh:mm:ss+00:00"
  const ts = (isConversion ? q.converted_at : q.created_at)
    .replace('T', ' ').replace(/\.\d+/, '').replace('Z', '+00:00');

  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${GADS_CUSTOMER_ID}/conversionActions/${actionId}`,
    conversionDateTime: ts,
    conversionValue: isConversion ? Number(q.quote_amount ?? q.estimated_amount ?? 0) : 0,
    currencyCode: 'USD',
    orderId: isConversion ? String(q.converted_order_id ?? q.quote_number) : q.quote_number,
  };

  // Prefer click ID; ALWAYS also send hashed user identifiers (enhanced conversions for leads)
  if (attr.gclid) conversion.gclid = attr.gclid;
  else if (attr.wbraid) conversion.wbraid = attr.wbraid;
  else if (attr.gbraid) conversion.gbraid = attr.gbraid;

  const userIdentifiers = [];
  if (q.customer_email)
    userIdentifiers.push({ hashedEmail: await sha256(normEmail(q.customer_email)) });
  if (q.customer_phone)
    userIdentifiers.push({ hashedPhoneNumber: await sha256(normPhone(q.customer_phone)) });
  if (userIdentifiers.length) conversion.userIdentifiers = userIdentifiers;

  if (!conversion.gclid && !conversion.wbraid && !conversion.gbraid && !userIdentifiers.length)
    return new Response('no identifiers, skipped', { status: 200 });

  const token = await getAccessToken();
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${GADS_CUSTOMER_ID}:uploadClickConversions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': Deno.env.get('GADS_DEVELOPER_TOKEN')!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
    },
  );
  const body = await res.text();
  console.log('gads upload', res.status, body.slice(0, 500));
  // Log failures to a table for retry
  return new Response(body, { status: res.ok ? 200 : 500 });
});
```

Also create:
- A `google_ads_upload_log` table (`quote_id`, `event_type`, `status`, `response`, `created_at`) and write every attempt to it.
- Two Database Webhooks (Dashboard → Database → Webhooks) on `quotes` INSERT and UPDATE pointing at the function, or a `pg_net` trigger if webhooks aren't enabled.

Secrets to set via `supabase secrets set`:
`GADS_CLIENT_ID`, `GADS_CLIENT_SECRET`, `GADS_REFRESH_TOKEN`, `GADS_DEVELOPER_TOKEN`, `GADS_ACTION_ID_LEAD`, `GADS_ACTION_ID_ORDER`.

### Task 4 — Manual steps (output as a checklist in the PR/README, human does these)

1. **Google Ads API access**: Google Cloud project → enable Google Ads API → OAuth client (desktop) → generate refresh token for the account owning 894-744-0123. Apply for a developer token (Basic access is enough) in the manager account.
2. **Create 2 conversion actions** in Google Ads (Goals → Conversions → New → Import → CRM/other data source → "Track conversions from clicks"):
   - `Quote Submitted (CRM)` — category: Submit lead form, count: One, value: none, click-through window 90 days. Turn ON "Enhanced conversions for leads".
   - `Quote Converted to Order (CRM)` — category: Purchase, count: Every, use value from upload.
   Record each action's numeric ID (in the URL when viewing the action) for the env vars.
3. **GTM**: add the conversion tag + enhanced conversions per Task 2, publish.
4. In Google Ads → Goals → Settings → turn on **Enhanced conversions** and **Enhanced conversions for leads** account-level toggles.
5. After 48–72h, verify in Google Ads → Goals → Summary that "Quote Submitted (CRM)" shows "Recording conversions", and check Diagnostics tab.

### Task 5 — Verification (automate what you can)

- Unit test the normalizers/hashers (Google requires SHA-256 of lowercased trimmed email; E.164 phone).
- Add a `?test_gclid=` dev path or Deno test that posts a fake webhook payload to the function locally (`supabase functions serve`) and asserts the request body shape.
- Confirm the quote submit payload now includes `gclid` when landing on `/?gclid=TEST123`.

### Constraints

- Do not touch the Meta pipeline — additive changes only.
- Conversion uploads must be idempotent: use `orderId` (Google dedupes on it) and skip if an identical success row exists in `google_ads_upload_log`.
- Never log raw email/phone in the upload log — log hashed values or presence flags only.
- `conversionDateTime` must be after the click time; if gclid is older than 90 days, drop it and rely on user identifiers.

---

## Reference: why this works like Meta CAPI

| Meta | Google equivalent (this implementation) |
|---|---|
| `fbclid` / `fbc` cookie | `gclid` / `wbraid` / `gbraid` + `_gcl_aw` cookie |
| CAPI hashed email/phone matching | Enhanced Conversions for Leads (hashed email/phone) |
| CAPI server events from CRM | `uploadClickConversions` via Google Ads API |
| Purchase event w/ value | `Quote Converted to Order (CRM)` with `conversionValue` |
