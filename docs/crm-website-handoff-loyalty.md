# CRM → Website handoff — Loyalty tier program (CL86F1)

**Purpose:** the contract the website (Next.js/Sanity) builds against for the three
loyalty tasks. The CRM owns the tier engine + codes on the shared Supabase backend; the
website owns the payment-field UI, `/rewards` page, and account badge.

**Status:** the tier engine + the `validate-loyalty-code` endpoint are **built** in the CRM
repo (`add_loyalty_program.sql`, `supabase/functions/validate-loyalty-code`). They deploy
via the SQL editor + `supabase functions deploy` (same manual path we used for the review
program). The website can build against the contract below now; go live once the owner
confirms deploy.

**Keep distinct:** the existing 365-day reorder *price-lock* is a DIFFERENT feature. This
Bronze/Silver/Gold program does not touch it. Good catch flagging that.

---

## Tier definitions (source of truth: CL86F1_1.MD)

Tiers by **lifetime PAID value** (Square-confirmed only; unpaid/pending/cancelled/refunded
excluded). Tier only goes **up** — never auto-downgraded. Codes are **personal + email-bound**.

| Tier | Threshold | Code | Benefits |
|---|---|---|---|
| **Bronze** | $1,000 | 5%, **single-use**, **90-day** expiry | Badge + one-time 5% |
| **Silver** | $5,000 | 5%, reusable, no expiry | Badge + standing 5% + free Velcro + priority mockup |
| **Gold** | $10,000 | 10%, reusable, no expiry | Badge + standing 10% + quarterly rush upgrade + dedicated contact |

**Hard rule (margin protection):** discounts apply to **standard calculator pricing ONLY** —
never stacked on custom/negotiated quotes, other promos, or sale prices. The website MUST
pass the real pricing context so the engine can reject non-calculator orders (below).

---

## Endpoint 1 — `validate-loyalty-code` (BUILT — Task 1 depends on this)

Server-to-server only. The website's **backend** calls it (never the browser) with a shared
secret header. The service-role key is never shared with the website.

```
POST  https://uxgzlneefybifvccfhwp.supabase.co/functions/v1/validate-loyalty-code
Headers:
  Content-Type: application/json
  x-loyalty-secret: <LOYALTY_VALIDATE_SECRET — owner provides; set on the function>

Body:
  {
    "code": "PANDA-SILVER-K7M4Q2",
    "email": "customer@example.com",
    "order_context": { "pricing_source": "calculator" }   // "calculator" | "custom_quote" | ...
  }
```

**Response** (always HTTP 200 unless auth/server error):
```json
{ "valid": true,  "tier": "silver", "percent": 5, "reason": "ok" }
{ "valid": false, "tier": "silver", "percent": 0, "reason": "expired" }
```

**`reason` codes** (use these to message the customer):
| reason | meaning | suggested UI copy |
|---|---|---|
| `ok` | valid — apply `percent` to the calculator subtotal | "5% Silver discount applied" |
| `code_not_found` | no such code | "We couldn't find that code." |
| `email_mismatch` | code isn't tied to this email | "That code belongs to a different account." |
| `expired` | Bronze code past its 90 days | "This code has expired." |
| `already_used` | single-use Bronze already redeemed | "This code has already been used." |
| `revoked` | admin-revoked | "This code is no longer active." |
| `not_combinable_with_custom_quotes` | order isn't calculator-priced | "Loyalty discounts apply to standard pricing only." |
| `unauthorized` / `server_error` | bad secret / outage (non-200) | generic retry |

**Validate ≠ redeem.** This call only validates. The CRM marks a single-use Bronze code
`redeemed` automatically when a **paid order carrying that code** lands. **This is now wired
on the CRM side** — you just need to set two fields on the **Square ORDER metadata** (the
same object where you already put `metadata.token`) when generating the discounted payment
link:

```
metadata: {
  token: "<your existing checkout token>",
  loyalty_code: "PANDA-BRONZE-K7M4Q2",     // the applied code, exactly as validated
  loyalty_discount_percent: "5"            // string or number
}
```

`square-payment-webhook` reads those, writes `orders.loyalty_code_used` +
`orders.loyalty_discount_percent`, and a DB trigger flips a single-use Bronze code to
`redeemed`. Reusable Silver/Gold codes are never consumed. Set it on the **order** metadata,
not the payment — Square doesn't reliably copy payment-level fields.

**Task 1 wiring:** on the payment step, call this server-side → if `valid`, apply `percent`
to the calculator subtotal → generate the Square link at the discounted amount → fire your
`loyalty_code_applied` dataLayer event. Post-discount amount is what flows to Square.

---

## Endpoint 2 — `loyalty-status` (BUILT — Task 3 account badge)

Same server-side + secret pattern (reuses the SAME `LOYALTY_VALIDATE_SECRET`). Maps the
site's customer to the CRM by **email** (no new identity system — the answer to your
account-link question):

```
POST  /functions/v1/loyalty-status
Body:    { "email": "customer@example.com" }
Response:
  {
    "tier": "gold",                        // 'none' | 'bronze' | 'silver' | 'gold'
    "lifetime_paid_value": 12450.00,
    "codes": [ { "code": "PANDA-GOLD-...", "percent": 10, "tier": "gold",
                 "single_use": false, "expires_at": null, "status": "active" } ]
  }
```
Show the badge only on a confirmed email match; if `tier: "none"`, show nothing.

---

## What the CRM/owner still needs to give you

1. **`LOYALTY_VALIDATE_SECRET`** — the shared secret for the `x-loyalty-secret` header
   (owner generates + sets on the function; you hold it in the website backend env).
2. **Deploy confirmation** — that `validate-loyalty-code` is live before you wire Task 1.
3. **Footer swap** — Task 2 replaces a low-value footer link (you flagged 98 links); confirm
   which link gets swapped for `/rewards` (no net growth, per the guardrail).

## What you can build now (per your own scoping)

- Payment-field "Have a code?" UI + the server-side validation route → against Endpoint 1.
- `/rewards` page structure (H1 + 40-word answer, how-it-works, FAQ+schema, CTA) — with the
  tier numbers/benefits from the table above (they're final).
- Account badge UI → against Endpoint 2's shape (flip on when it ships).

## Out of scope here

Tier-award emails (E1–E6), CRM admin UI, and the perks (free Velcro / priority mockup / Gold
rush) are CRM-internal and don't affect these contracts.
