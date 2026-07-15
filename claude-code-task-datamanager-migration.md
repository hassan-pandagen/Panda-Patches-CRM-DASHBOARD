# Claude Code Task — Migrate Google Ads order tracking off the dead legacy endpoint to Data Manager

> **Supersedes the earlier "gclid attribution" task.** The code trace already found the real blocker (below). This file tells you what to build instead.

## Status / what we now know
- **Front-end capture is already built and correct.** `localStorage["pp_attribution_v1"]` captures `{ first_seen_at, fbp, fbc, gclid, gbraid, gclid_captured_at, utm_source, utm_medium, utm_campaign, page_url, referrer }`. Do **not** rebuild this.
- **Root cause found:** the CRM function *and* the website's fix both call the legacy Google Ads API `UploadClickConversions` endpoint, which returns `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`.
- **This is unfixable on the legacy path.** Per Google's developer blog (May 2026): as of **June 15, 2026** the Google Ads API stopped accepting *new adopters* for offline conversion imports. Only accounts that imported between Dec 2025–May 2026 are grandfathered. This account was not, so it can never use `UploadClickConversions`. **Do not attempt allowlisting — there is no path.**
- **Mandated replacement:** Google **Data Manager**. Migration guide: https://developers.google.com/google-ads/api/docs/conversions/upload-offline (see Data Manager migration section) and Google Ads UI → Tools → Data Manager.

## Decision baked into this task
Build the **low-code Data Manager path first** (scheduled data connection), **not** a full server-to-server Data Manager API integration. At this account's volume (single-digit orders/month today) a scheduled connection is sufficient and far less work. Only escalate to the full API if real-time or high volume is later required.

## Match key: use gclid, add hashed email/phone as fallback
- **Primary:** `gclid` (now captured in `pp_attribution_v1`) → most precise click match.
- **Fallback / enhanced:** hashed **email** + **phone** (already collected in `pp_checkout_state`: `email`, `phone`). Normalize (trim, lowercase email; E.164 phone) then **SHA-256** hash. This recovers orders where the gclid is missing (e.g., cross-device, cookie cleared).
- Send **both** when available; Data Manager can use either.

## Steps
### 1. Disable the dead legacy path
- Find every call to the Ads API `UploadClickConversions` (in the CRM function and the website "fix") and stop it — it will always fail with `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`. Log a clear deprecation note; don't leave silent failing retries.

### 2. Confirm the data actually reaches the order record (may already work — verify)
- Trace the quote/checkout submit → backend → CRM/order. Confirm each **order** record persists: `gclid`, `gbraid`, `wbraid`, `fbc`, `email`, `phone`, order timestamp, order value, currency.
- If `pp_attribution_v1` isn't being attached to the submission payload, attach it (read it at submit, merge into the body). This is the one thing that must be true for *either* Data Manager path to work.

### 3. Build the low-code Data Manager connection (primary deliverable)
- Produce a **scheduled export of converted orders** to a **Google Sheet** (or BigQuery table) with columns Data Manager expects, one row per order:
  - `Google Click ID` (gclid) — or gbraid/wbraid
  - `Conversion Name` — must **exactly** match the Google Ads conversion action (`Quote Converted to Order (CRM)`; and `Direct Purchase` for online-checkout orders)
  - `Conversion Time` (order placed timestamp, correct timezone/format)
  - `Conversion Value` + `Currency`
  - Hashed `Email` and `Phone` columns (SHA-256, normalized) for enhanced matching
- Export cadence: at least daily; include only orders whose original click is within the conversion window (see §5).
- Then a human connects that Sheet/BigQuery source in **Google Ads → Data Manager → scheduled connection** and maps the columns. (Config, not code.)

### 4. (Only if later needed) Full Data Manager API integration
- Server-to-server ingestion via the Data Manager API: new OAuth scopes + payload shape per Google's migration guide. Skip for now; leave a `// TODO: Data Manager API` stub referencing the guide.

## Acceptance criteria
- No code path still calls `UploadClickConversions`.
- Each converted order persists gclid + hashed email/phone + timestamp + value.
- The scheduled export writes correct rows to the Sheet/BigQuery source.
- After a human connects the source in Data Manager, a test order (placed via `?gclid=TEST123`) appears as a matched conversion in Google Ads (status **Recording**, not Misconfigured).

## Human tasks (Google Ads UI — not code)
- Tools → **Data Manager** → create the scheduled connection to the Sheet/BigQuery source; map columns; accept customer-data terms if prompted.
- On `Quote Converted to Order (CRM)`: set click-through **conversion window to 90 days** (covers the quote→order lag).
- Once real orders import, **promote "Purchases" to the primary conversion goal** on the Bulk campaign so Maximize Conversions optimizes toward orders, not lead-form fills.

## Note for the business
Google Ads has produced ~0 orders across ~$31k historically, while Facebook and SEO drive actual sales. Use this low-code path to **prove the Bulk campaign can produce trackable orders before investing in the full Data Manager API build.** Don't over-engineer attribution for an unproven channel.
