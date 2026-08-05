# Claude Code Prompt: CRM lead-source filters + attribution report (portal.pandapatches.com)

Goal: one-click visibility into where quotes come from and what each source
actually produces. The data already exists on every quote (three distinct
fields — do not conflate them):
- **source** — which form/page (Homepage Hero Form, Embroidered Product Page…)
- **traffic** — acquisition channel (Google Ads, Google (Organic), Facebook
  Click, Instagram, Direct/Unknown, ChatGPT, Bing…)
- **heard_about** — self-reported discovery (ChatGPT/Claude, Grok, friend…)

## Task 1 — Quotes page: one-click source filter chips

1. Filter chip row above the quotes list: All · Google Ads · Google Organic ·
   Facebook · Instagram · AI (ChatGPT/Claude/Grok/Perplexity/Gemini grouped) ·
   Direct · Other. Chips show live counts for the selected date range.
   One click = filtered list. Combine with the existing date range.
2. Secondary filter dropdowns for exact traffic value and heard_about value.
3. Add a "Heard about" column to the list view (it's currently only visible
   inside the email/detail).
4. URL-persisted filters (shareable: /quotes?traffic=google_ads).

## Task 2 — Reports: Lead Source Attribution report

New report section with date-range picker (default 30 days):
1. **By traffic source**: quotes · unique leads (dedupe by normalized email;
   also collapse same-email duplicate submissions within 48h — currently ~30%
   of volume) · quotes→orders · orders · paid orders · revenue · revenue per
   quote. ORDER MATCHING BY NORMALIZED EMAIL (not name) joining quotes →
   orders → Square payments; where emails differ, fall back to phone digits.
2. **By heard_about**: same columns — this is the AI-influence view (ChatGPT,
   Claude, Grok as rows).
3. **The multi-touch matrix**: traffic × heard_about grid (e.g., how many
   Google Ads quotes ALSO say ChatGPT/Claude). This measures the documented
   pattern of AI-created demand captured via Google — the single most
   decision-relevant table for budget allocation.
4. Trend chart: quotes per source per week.
5. CSV export button on each table.

## Task 3 — Data hygiene (same deploy)

1. Normalize traffic values (one canonical enum; "Google Ad" vs "Google Ads"
   vs "Google Ads Click" from older template versions map to google_ads;
   keep raw value in a secondary column).
2. Backfill: run the normalizer over historical quotes so the report works
   for past data, not just new quotes.
3. Duplicate flag: mark quotes as `is_duplicate` when same normalized email
   submits again within 48h (list shows them collapsed with a "2 submissions"
   badge; report counts unique leads).

## Guardrails
- Read-only feature over existing data + one enum/flag column; no changes to
  quote ingestion, tracking scripts, GTM, Data Manager exports, or the frozen
  `_export_crm` view.
- Email normalization must reuse the exact function the Google Ads export
  uses (consistency between report numbers and ad-platform matching).
- RLS: report endpoints follow existing role checks (admin/manager).

## Acceptance
1. One click on "Google Ads" chip → only google_ads-traffic quotes, correct
   count, URL shareable.
2. Report reproduces known ground truth: the Jul 20–30 window shows ~72
   google_ads quotes collapsing to fewer unique leads, and the traffic ×
   heard_about matrix shows the Google Ads × ChatGPT/Claude cell ≥1
   (documented cases: JaCobi; Google Organic × ChatGPT/Claude: Benenson).
3. Revenue column matches Square-confirmed payments for a spot-checked source.
4. Historical backfill: June quotes with "Google Ads Click" traffic appear
   under google_ads.
