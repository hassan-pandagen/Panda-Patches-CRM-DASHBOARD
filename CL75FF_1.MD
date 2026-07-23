# Claude Code Prompt: CRM "Add Order" + "Re-order" with Square payment links

Target: portal.pandapatches.com (custom CRM, Supabase backend, Square already
integrated — payment webhook exists and currently marks orders paid).

Owner decisions (Jul 22, 2026):
- Reorder pricing: **prefill from the original order, fully editable** before link generation.
- Payments: **deposit support** — staff can set a partial amount (e.g. 50%); order tracks balance due; second link for the remainder.
- "Process without payment": order goes to production immediately, **but a payment link is still generated and the unpaid balance is tracked**; webhook clears it whenever paid.

## Feature overview

On every customer detail page (see Account Details card), add two buttons:
**+ Add Order** and **↻ Re-order**.

Both open the same Order Builder; Re-order arrives prefilled.

### 1. Order Builder (shared form)

- Customer info prefilled from the account (name, email, phone, company, default
  shipping address — editable per order, per the existing "new orders use these
  details" rule).
- Line items: patch type, size, quantity, backing, options, unit price, line total.
  Manual price entry allowed (staff-facing tool); show running order total.
- Shipping method + cost, rush flag, notes.
- **Re-order path**: staff picks which past order to clone (list the customer's
  orders, most recent first, with date/total/items summary). Clone all line items
  and options at ORIGINAL prices, editable. Show a subtle "Cloned from order #X —
  prices from {date}, review before sending" banner so stale pricing gets a look.

### 2. Payment section (bottom of builder)

Payment amount:
- ( • ) Full amount — $TOTAL
- (   ) Deposit — staff enters $ or % (validate 0 < deposit < total); balance due
  shown next to it.

Processing mode (radio, required):
- ( • ) **Wait for payment** — order is created in status `pending_payment` and is
  NOT released to production/uploaded until Square confirms payment (deposit or
  full, per selection above).
- (   ) **Process without payment** — order is created in status `in_production`
  immediately, with `payment_status = unpaid` and an UNPAID badge (amber) on the
  order row and customer page. Link still gets generated and sent.

Submit → creates the order row + generates a **Square Payment Link** (Payment Links
API / checkout link) for the selected amount, stores `square_payment_link_id` +
URL on the order, and shows a copy-link modal (copy button + optional "email to
customer" using the existing email-send path, from sales@pandapatches.com).

### 3. State machine (make this explicit in code)

```
order_status:   draft → pending_payment → in_production → ... (existing statuses)
                     ↘ in_production (if "process without payment")
payment_status: unpaid → deposit_paid → paid
```

Webhook rules (extend the existing Square webhook handler — do not fork it):
- Match incoming payment to order via `square_payment_link_id` (store the link's
  order/checkout id at creation; do NOT match on amount or email).
- Payment received on a **wait-for-payment** order → set `deposit_paid` or `paid`
  per amount; if the selected trigger amount is met, move order to
  `in_production` ("the order is uploaded" per owner) and fire the existing
  paid-order side effects.
- Payment received on a **process-without-payment** order → update
  `payment_status` only; order status untouched (already in production).
- Deposit flow: when `deposit_paid`, surface a **"Generate balance link"** button
  on the order that creates a second Square link for the remainder; webhook on
  that link sets `paid`.
- Idempotency: webhook must tolerate replays (check payment id already recorded).

### 4. Guardrails — things NOT to break

- **Google Ads conversion upload**: the existing paid-order → Google Ads upload
  path must fire only on payments attached to a click (gclid/wbraid present).
  Staff-created orders (phone/email/reorders) have no click id — they must NOT be
  uploaded as ad conversions. Reorders are tracked as a CRM metric, not an ads
  conversion (owner decision Jul 22).
- Data Manager exports (`google_ads_data_manager_export_*` views): new orders
  should flow into them exactly like Square-webhook orders do today — verify the
  views pick up staff-created orders; do not modify the frozen `_export_crm` view.
- Existing orders keep their address snapshot (current behavior) — the builder
  writes an address snapshot onto the order, never a reference to the live account.
- RLS/roles: reuse existing role checks; the security retrofit (anon/authenticated
  revokes, `_ro` roles) must not be loosened for the new endpoints. Link
  generation and webhook logic live in edge functions with service-role keys —
  never expose Square credentials client-side.
- No changes to the public website, GTM, or tracking.

### 5. Reorder metric (small bonus, same deploy)

Add `is_reorder boolean` on orders (true when created via the Re-order path OR
when customer email matches a prior paid order). Surface three numbers on the
Reports page: reorder rate, median days-to-reorder, reorder revenue share.
This powers the month-2 reorder-campaign decision — CRM metric only, nothing
sent to Google Ads.

### 6. Acceptance tests

1. Add Order → full amount → wait for payment: order invisible to production
   queue until webhook fires; then in_production + paid.
2. Add Order → 50% deposit → wait for payment: webhook on deposit moves to
   in_production + deposit_paid; balance link → paid.
3. Add Order → process without payment: instantly in production, UNPAID badge;
   later payment clears badge without touching order status.
4. Re-order: clone shows original prices, edit a quantity, banner visible,
   is_reorder = true.
5. Webhook replay of the same payment id: no duplicate state changes.
6. Staff-created order does NOT appear in Google Ads click-conversion uploads;
   DOES appear in Data Manager customer/order exports.
