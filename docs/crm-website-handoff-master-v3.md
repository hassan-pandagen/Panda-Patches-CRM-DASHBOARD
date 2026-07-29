# CRM ↔ Website handoff — Panda Patches MASTER v3

**Purpose:** what the website (Next.js/Sanity) side needs to consume the three CRM-owned
items, and what the CRM needs back from the website dev so the contracts line up.

**Ownership split:** the CRM repo owns generation (review invites, data exports) on the
shared Supabase backend. The website owns rendering (CompanyFacts, city pages, shipping
schema, JSON-LD). Nothing here changes the frozen Google Ads export views, GTM, or
conversion wiring.

**Status:** Item 1 (review email program) is being built now. Items 2 & 3 are data
exports scheduled for the later waves — schemas below are final so the site side can build
against them today.

---

## Item 1 — Review metrics → CompanyFacts (currently 4.7 / 76)

**Important — source of truth:** the CRM does **not** produce the public star rating or
review count. Those are **Trustpilot's** verified numbers. The CRM only generates review
*invitations* and measures invitation→review conversion internally. So the site's
CompanyFacts rating/count come from Trustpilot, not from us.

### Public rating + count (for CompanyFacts + AggregateRating JSON-LD)

- **Source:** Trustpilot Business Unit (public). Two options, website dev picks:
  1. **Recommended:** pull `stars` + `numberOfReviews` from the Trustpilot Business API
     (or the public business profile) on a monthly build, write into the Sanity
     `companyFacts` doc.
  2. Manual monthly update from the Trustpilot dashboard into Sanity (no code).
- **Do NOT** hardcode 4.7 / 76 — it drifts and the whole point of Item 1 is to move it.
- **JSON-LD** (`Organization` or `Product` → `aggregateRating`): use ONLY Trustpilot's
  verified aggregate. Do not synthesize a rating from CRM data — that would be
  non-compliant (fabricated review signal).

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "<from Trustpilot>",
  "reviewCount": "<from Trustpilot>",
  "bestRating": "5"
}
```

### Internal program metrics (CRM-side, NOT for public site)

The CRM will expose these in the CRM Reports page only (invitations sent/month,
invitation→review rate once the Trustpilot API is wired, rating trend). The website does
**not** consume these — listed so both sides know the boundary.

### Compliance the site copy must respect (Trustpilot + FTC 2024)

- No incentives offered for reviews anywhere (site or email).
- No review-gating (no "was it good? → review / was it bad? → private form" fork).
- The review CTA on the site links to the same Trustpilot profile the emails use.

---

## Item 2 — City-page dataset (top ~3 metros, refreshed quarterly)

The CRM script-generates one row per qualifying metro. A metro qualifies **only if ≥ 20
delivered orders** — if it's not in the file, the site must **not** build a page for it.

### Row schema (final)

```json
{
  "metro": "Houston, TX",
  "deliveredCount": 143,
  "medianShipToDeliveryBizDays": 3,
  "fedexZone": "2",
  "rushTransit": "1–2 business days",
  "orgTypes": ["fire departments", "universities", "breweries"],
  "dataDate": "2026-07-28"
}
```

| Field | Type | Notes |
|---|---|---|
| `metro` | string | Display name, "City, ST" |
| `deliveredCount` | integer | Delivered orders to this metro; always ≥ 20 (gating) |
| `medianShipToDeliveryBizDays` | integer | Median business days ship→delivery |
| `fedexZone` | string | FedEx zone for the metro |
| `rushTransit` | string | Typical rush transit for that zone |
| `orgTypes` | string[] | **Types only** — never client names without written permission |
| `dataDate` | string | ISO date the row was generated |

### Delivery / hosting (website dev to confirm preference)

- **Recommended:** committed, dated `city-metros.json` (array of the rows above) that the
  Next.js build imports at build time. Simple, honest, versioned, no runtime dependency.
- Alternative: a read-only Supabase view the site queries at build. Say if you prefer this.

### Guardrails the site must honor

- Only render pages for metros present in the file (the ≥20 gate lives in the data).
- Show `dataDate` on the page ("as of …") — these are honest, dated stats.
- Never render a client name; `orgTypes` is the only org-identity field and it's types only.

---

## Item 3 — Baselines / evidence exports

### 3a. Shipment-history countries → Product shipping schema

- The site's Product `shippingDestinations` is currently **US / CA / GB / AU**.
- CRM will export the **actual** destination countries shipped to. Website dev then
  **confirms or extends** the enum to match reality.
- Shape: `["US", "CA", "GB", "AU", ...]` (ISO-3166 alpha-2).

### 3b. B5 stat check ("median order ≈ 20 pieces / 896-order dataset")

- CRM will confirm the current numbers (median pieces per order + total order count).
- Website dev updates any on-site copy that cites these so the figures stay truthful.

---

## What the CRM needs FROM the website dev (please send back)

1. **Trustpilot Business Unit URL / ID** (and confirm the plan tier — decides whether we
   can move to Trustpilot's Automatic Feedback Service / invitation API vs. a plain review
   link). The email link the CRM sends must match the profile the site shows.
2. **Sanity field names** for: `companyFacts` (rating/count fields), the City page doc
   type + its field names (so the export keys map 1:1), and Product `shippingDestinations`.
3. **City data delivery preference:** committed JSON at build time (recommended) vs.
   Supabase view at build.
4. **Site build/deploy trigger** for quarterly city refresh + monthly CompanyFacts refresh
   (webhook? scheduled build? manual?).
5. Confirmation there are **no review incentives or gating** anywhere in the current site
   copy (compliance).

---

## Out of scope for this handoff

The loyalty tier/badge program (Bronze/Silver/Gold) and its website promo-validation
endpoint (`validate_loyalty_code`) are a **separate brief** with their own contract — not
covered here. Flagging so it's not conflated with the review program above.
