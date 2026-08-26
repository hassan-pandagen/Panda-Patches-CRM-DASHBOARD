# Claude Code Brief (CRM): invoice numbers on payment forms + automatic paid-invoice email (Aug 27, 2026)

## What the CEO wants

1. Every customer payment-form/checkout page shows an **invoice number**.
2. When payment completes, a **PAID invoice PDF is emailed to the customer
   automatically** — no agent action.

## 1. Invoice numbering

- Format: **INV-{orderNumber}** (e.g. INV-PP-11248) when the payment form is
  tied to an order; for standalone payment forms created before an order
  exists, generate INV-PF-{formId} and re-link when converted.
- One invoice number per payment form, generated at form creation,
  immutable, stored on the form/order record.
- Display on the checkout page in the Order Details card ("Invoice No.
  INV-PP-11248") and include it in the Square checkout reference/note so
  the Square receipt and our invoice reconcile 1:1.

## 2. Paid-invoice email automation

Trigger: Square webhook `payment.completed` (the same event CAPI already
consumes — reuse the handler, don't add a second webhook subscription).

On trigger:
1. Generate a PDF using the house invoice template (MC Patches LLC t/a
   Panda Patches header — same layout as the Wise/Homewood invoices):
   itemized line(s) from the payment form (design name, patch type, qty,
   size, backing, unit price, amount), shipping "Included", tax $0.00,
   **large "PAID" mark** with payment date, method (card via Square), the
   invoice number, and the Square payment reference. No ACH block on paid
   invoices.
2. Email it to the customer from **billing@pandapatches.com** (mailbox
   being created — confirm it exists before shipping; SPF/DKIM must pass).
   Subject: "Paid invoice INV-PP-XXXXX — Panda Patches". Short body: thanks,
   invoice attached, what happens next (mockup/production per order stage),
   reply-to billing@.
3. Store the PDF (or its generation inputs) on the order record with a
   `paid_invoice_sent_at` timestamp; show a "Paid invoice sent ✓" chip on
   the order page. Idempotent: one send per payment, safe on webhook
   retries.

## 3. ONE order number everywhere (CEO, Aug 27) — fix before/with the above

The customer portal currently shows a DIFFERENT order number than the
internal portal for the same order. That's a support and reconciliation
hazard: a customer quoting their number can't be found by an agent
searching ours, and invoices/receipts/CAPI/tracking all reference the
internal one.

Required:
1. **The internal order number (PP-xxxxx) is the single canonical order
   identifier**, shown identically in the customer portal, the internal
   portal, payment forms, invoices/receipts, emails, and shipping
   references. Retire the separate customer-facing number.
2. Find every place the customer-facing number is generated/displayed and
   replace with the canonical field. Grep for the generator and any
   template using it.
3. **Migration**: existing customer-facing numbers must remain findable —
   keep the legacy value on the record as `legacy_customer_ref` and make
   internal search match on BOTH (so an agent can still find an order from
   an old email quoting the old number). Do not reuse or renumber
   historical orders.
4. Invoice numbering in §1 keys off the canonical number
   (INV-PP-11248) — this item is a prerequisite for that to make sense.
5. **URLs too, not just displayed text.** The CEO sees numbers like "1149"
   in tawk.to's live-visitor view, which reports the URL the customer is
   on — so customer-portal/payment-form URLs currently carry a non-canonical
   ID. Make the canonical order number the URL identifier
   (e.g. /orders/PP-11248, /pay/PP-11248) so support can identify a live
   chat visitor's order at a glance. Old URLs must 301 to the new ones and
   keep resolving (customers have them in old emails). If a raw database ID
   must stay in the path for technical reasons, add the canonical number as
   a readable segment or query param so it appears in tawk's view.
6. **tawk.to page titles**: set the customer-portal page title to include
   the canonical number ("Order PP-11248 — Panda Patches") — tawk shows the
   title alongside the URL, so this alone makes live chats identifiable
   even before the URL work lands.

## 4. Edge cases (v1 rules)

- **Deposits** (the $50-deposit flow): a deposit payment sends a "Deposit
  receipt" variant (shows amount paid + balance due), NOT a paid invoice.
  The full paid invoice sends when the balance completes.
- **Manual/Net-30 invoices** (schools/POs like Homewood): out of scope —
  those remain manually issued; this automation covers Square payment-form
  flow only.
- **Refunds**: no automation in v1; agents handle manually.
- Numbering never resets; no gaps required (voided forms may consume
  numbers — acceptable).

## Acceptance

0. Same order opened side by side in the customer portal and the internal
   portal showing the SAME PP-xxxxx number (screenshots); internal search
   still finds it by the legacy customer reference; the portal URL and page
   title both carry PP-xxxxx (screenshot of the tawk.to visitor row showing
   an identifiable order); old URLs 301 correctly.
1. Test payment form: invoice number visible pre-payment; after a test
   Square payment, the customer email arrives with a correct PAID PDF
   (screenshot + the PDF attached to the report).
2. Square receipt and PDF carry the same invoice number.
3. Deposit path verified separately (deposit receipt, then final invoice).
4. Webhook idempotency demonstrated (replayed event ≠ duplicate email).
5. From-address billing@pandapatches.com, SPF/DKIM passing (headers shown).
