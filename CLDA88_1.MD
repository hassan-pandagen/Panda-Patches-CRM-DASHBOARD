# Claude Code Prompt: Customer Match audience feed (Supabase → Google Ads Data Manager)

Goal: turn the CRM customer base into an auto-refreshing Google Ads Customer Match
audience, used for (1) Observation on the new Core Search campaign, (2) a future
reorder/remarketing campaign, (3) Smart Bidding seed data.

Context: two Data Manager PostgreSQL connections already exist and run daily
(`google_ads_data_manager_export_leads` → Quote Submitted (CRM),
`google_ads_data_manager_export_crm` → Quote Converted to Order (CRM)).
This adds a third with use case "customer list" instead of "conversions".

## Task 1 — Create the export view in Supabase

Create view `google_ads_data_manager_export_customers` reading from the customers/orders
tables. Columns (Data Manager's Customer Match schema):

- `email` — lowercase, trimmed. Plain text is fine (Data Manager hashes on ingest);
  if you prefer pre-hashing, SHA-256 of the normalized value, consistent with the
  existing conversion views.
- `phone` — E.164 (+1...), or hashed equivalent.
- `first_name`, `last_name` — lowercase, trimmed (optional but improves match rate).
- `country` — ISO-2, e.g. 'US'.
- `zip` — postal code where known (optional).

Rules:
- Include ONLY customers who have transacted (orders table) OR submitted a quote —
  first-party relationship required by Customer Match policy. Prefer: all customers
  with ≥1 order, plus leads from the last 540 days.
- Exclude rows with null/invalid email AND null phone (need at least one identifier).
- Deduplicate by email.
- Grant SELECT to the same read-only role used by the existing Data Manager
  connections (`google_ads_data_manager_ro...`).

## Task 2 — Connect it in Google Ads Data Manager (UI, ~5 min)

Google Ads → Tools → Data manager → PostgreSQL (existing product) → Add connection:
1. Source: same Postgres credentials, select `google_ads_data_manager_export_customers`.
2. **Use case: Customer list / audience** (NOT conversions).
3. Map fields: email→Email, phone→Phone, first/last name, country, zip.
4. Consent step: account-level defaults (same as the conversion connections).
5. Schedule: daily (same 02:00–03:00 window is fine).
6. Name the audience: `CRM Customers (auto-sync)`.

Verify next day: connection status "Completed"; audience visible in Tools → Shared
library → Audience manager with a growing member count (match rate appears in ~24–48h).

## Task 3 — Attach as Observation to Core Search (no targeting change)

Campaign: `PP — Core Search — Patch Types — Jul 2026` (ID 24044777165).
Audiences → Add audience → select `CRM Customers (auto-sync)` → **Observation** mode.
Do NOT set a bid adjustment yet; after 2–3 weeks compare its conv. rate vs. non-audience
traffic and add a positive adjustment if it outperforms.

## Task 4 (Month 2, gated) — Reorder campaign

Only after Core Search holds CPL ≤ $25 for 2 consecutive weeks:
- Demand Gen campaign, audience = `CRM Customers (auto-sync)` ONLY (no expansion),
  $10–15/day. Creative angle: "Your design is on file — reorder in 2 clicks."
  Repeat customers are the #1 revenue source ($6,930 in July, 5.9% repeat rate) —
  this campaign exists to push that rate toward 10%+.
- Landing: /offers (fixed-price packs) or a dedicated /reorder page if built.

## Guardrails
- Customer Match policy: only first-party data from customers who have a direct
  relationship; honor deletions (view should exclude customers who requested erasure).
- Don't touch the two existing conversion connections or their views.
- No changes to GTM, attribution scripts, or the quotes/orders exports.
