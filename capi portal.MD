# Dev Brief — Order Form → Square → Meta CAPI Purchase Attribution

**Owner:** Panda Patches
**Goal:** Recover chat-sale attribution by firing a server-side Meta Conversions API (CAPI) `Purchase` event when a customer pays via Square, matched back to the originating Meta ad through Advanced Matching (PII) + browser signals (`fbp`/`fbc`).
**Channel scope:** Channel-agnostic. Works for any chat origin (WhatsApp, Messenger, IG) because attribution fires from the website payment page, not the chat thread. No WhatsApp Business API / BSP required.

---

## 1. What we are and are NOT doing

| | |
|---|---|
| **Doing** | Website-based CAPI attribution. `action_source: "website"`. Match via hashed email/phone/name + `fbp`/`fbc` + IP + user agent. Server-side fire from Square webhook, deduped against a client-side Pixel event. |
| **NOT doing** | `ctwa_clid` / `business_messaging` attribution (that needs the WhatsApp API, which we're skipping). So matching is PII/identity-graph based, not deterministic click-ID. Expect strong-but-not-perfect match rates. |

**Hard constraint:** Meta uses a **7-day click** attribution window. The funnel is click → chat → mockup → **deposit** (days later) → balance (more days later). The `Purchase` event MUST fire at **deposit**, as early as possible, or it risks falling outside the window. See §7.

---

## 2. End-to-end flow

```
0. In the CRM, when building the order page, operator picks the payment option(s) to
   offer: PAY IN FULL only, DEPOSIT only, or BOTH. Square payment link(s) are
   auto-generated for the chosen option(s) (see §2A).
1. Rep sends customer a link to the order form (per-order URL, e.g. /order/{orderId}).
2. Order form page loads:
   - Renders order line items + shipping; customer can edit.
   - Shows the payment option(s) configured in the CRM (full / deposit / both).
   - Meta Pixel fires PageView.
   - JS captures: _fbp cookie, _fbc cookie (or builds fbc from ?fbclid= if present),
     and generates a stable event_id for this order.
   - These four signals (fbp, fbc, client_ip, user_agent) + event_id are POSTed to our
     backend and STORED against orderId. (Critical: the webhook has no browser context,
     so we must persist these now.)
3. Customer chooses "Pay in full" or "Start with deposit" → opens the matching
   auto-generated Square link → completes payment.
4. Square sends `payment.updated` webhook (status COMPLETED) to our backend.
5. Backend handler:
   - Verifies Square signature.
   - Looks up orderId → retrieves stored fbp/fbc/ip/ua/event_id + customer PII + FULL order total.
   - If this is the order's FIRST completed payment (deposit OR full), fires Meta CAPI
     `Purchase` (server-side) with that event_id, valued at the FULL order total.
   - If it's the balance payment of a deposit order, fires nothing to ads (see §7).
6. (Optional but recommended) Thank-you page also fires a client-side Pixel `Purchase`
   with the SAME event_id → Meta dedupes the two, keeping whichever has better signal.
```

---

## 2A. Payment modes & CRM configuration

The order page supports two payment modes, set per-order in the CRM:

| Mode | Customer sees | Square link(s) generated |
|---|---|---|
| **Pay in full** | One button: pay full order total now. | One link for the full total. |
| **Deposit** | One button: pay deposit now, balance later. | One link for deposit; a second (balance) link generated/sent later. |
| **Both** | Two buttons: "Pay in full" or "Start with a deposit". | Both of the above. |

**CRM behavior**
- Operator toggles which option(s) appear when creating the page. Default can be **Both** (let the customer choose).
- **Auto-generate the Square link(s)** via the Square API (Payment Links / Checkout API) at page-create time, with `reference_id = orderId` and `order_id` set, so the webhook can map payment → order.
- Always store the **full order total** in our DB against `orderId`, regardless of which mode/option is used. This is the value sent to Meta.

**Why CAPI logic stays simple:** whichever option the customer picks, the **first completed payment** for the order is the trigger, and the event value is always the **full order total**. Pay-in-full → one payment, fires once. Deposit → fires on the deposit, balance fires nothing. No branching in the CAPI sender beyond a "has this order already fired Purchase?" guard.

> Deposit-mode caution: the deposit payment's `amount_money` is only the deposit. Do **not** use it as the event value — always pull the stored **full order total**.

---

## 3. Capture on the order-form page (client-side)

Load the Meta Pixel, then capture and persist:

```js
// Pixel base code with your PIXEL_ID, then:
function getCookie(name){return document.cookie.split('; ').find(r=>r.startsWith(name+'='))?.split('=')[1];}

const fbp = getCookie('_fbp');                 // e.g. fb.1.1700000000000.1234567890
let   fbc = getCookie('_fbc');                 // present if user arrived with ?fbclid=
const fbclid = new URLSearchParams(location.search).get('fbclid');
if (!fbc && fbclid) {
  fbc = `fb.1.${Date.now()}.${fbclid}`;        // build fbc when only fbclid is in URL
}
const eventId = `purchase_${ORDER_ID}`;        // deterministic → same id used server-side

// Persist to our backend so the Square webhook can use them later:
fetch('/api/attribution', {
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ orderId: ORDER_ID, fbp, fbc, eventId,
                         userAgent: navigator.userAgent })
});
// Capture client_ip server-side from the request that hits /api/attribution (don't trust JS).
```

> Note: `fbc` will often be empty for chat traffic (the WhatsApp in-app browser usually doesn't carry `fbclid`). That's expected — matching then leans on hashed PII + `fbp` + IP/UA. Still capture it when present; it materially boosts match quality.

**Persist per order:** `fbp`, `fbc`, `client_ip_address`, `client_user_agent`, `event_id`, plus the customer's `email`, `phone`, `first_name`, `last_name`, `city/state/zip/country` from the form, and `order_value` / `currency`.

---

## 4. Square webhook setup

- **Subscribe to:** `payment.updated` (Payments API). Fire CAPI only when `data.object.payment.status === "COMPLETED"`. (Ignore APPROVED/PENDING/FAILED.)
- **Verify the signature** on every request using your Square webhook signature key (HMAC-SHA256 over notification URL + raw body). Reject if mismatch.
- **Idempotency:** Square may redeliver. Key on `event_id` from Square (the webhook's own id) and skip if already processed. Also guard against firing the same Meta `event_id` twice.
- **Map payment → order:** Use Square `order_id` / `reference_id` (set this to our `orderId` when creating the payment link) to look up stored attribution data.
- **Reference:** https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated

```jsonc
// payment.updated payload (trimmed)
{
  "type": "payment.updated",
  "event_id": "sq-evt-...",            // use for idempotency
  "data": { "object": { "payment": {
      "id": "pay_...",
      "order_id": "ord_...",           // → our orderId lookup
      "reference_id": "ORDER_12345",
      "status": "COMPLETED",
      "amount_money": { "amount": 29000, "currency": "USD" }  // cents
  }}}
}
```

---

## 5. Meta CAPI Purchase request (server-side)

**Endpoint** (current version is **v25.0**; confirm at deploy time, Meta versions quarterly):

```
POST https://graph.facebook.com/v25.0/{DATASET_ID}/events?access_token={CAPI_ACCESS_TOKEN}
```

`{DATASET_ID}` = your Pixel/Dataset ID. `{CAPI_ACCESS_TOKEN}` = system-user token from Events Manager (store as a secret, never client-side).

**Payload:**

```jsonc
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1735680000,                 // Unix seconds, time payment completed
    "event_id": "purchase_ORDER_12345",        // SAME as client Pixel → dedup
    "action_source": "website",
    "event_source_url": "https://shop.pandapatches.com/order/ORDER_12345",
    "user_data": {
      "em":  ["<sha256 of normalized email>"],
      "ph":  ["<sha256 of normalized phone>"],
      "fn":  ["<sha256 of first name>"],
      "ln":  ["<sha256 of last name>"],
      "ct":  ["<sha256 of city>"],
      "st":  ["<sha256 of state>"],
      "zp":  ["<sha256 of zip>"],
      "country": ["<sha256 of 2-letter country>"],
      "client_ip_address": "203.0.113.42",     // NOT hashed
      "client_user_agent": "Mozilla/5.0 ...",  // NOT hashed
      "fbp": "fb.1.1700000000000.1234567890",  // NOT hashed
      "fbc": "fb.1.1700000000000.IwAR..."      // NOT hashed; omit if none
    },
    "custom_data": {
      "currency": "USD",
      "value": 290.00,                          // dollars (decimal), not cents
      "order_id": "ORDER_12345"
    }
  }],
  "test_event_code": "TEST12345"                // ONLY while testing; remove in prod
}
```

- `value` must be in **major units** (dollars), even though Square reports **cents** — divide `amount_money.amount` by 100.
- Send the customer's `client_ip_address` and `client_user_agent` you stored at form load (the webhook's own IP/UA is your server's — useless for matching).

**Docs:** https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/ · https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/

---

## 6. SHA-256 hashing rules (Advanced Matching)

Hash these client-side-PII fields with **SHA-256, lowercase hex**, AFTER normalizing. Do **not** hash `fbp`, `fbc`, `client_ip_address`, `client_user_agent`.

| Field | Normalize before hashing |
|---|---|
| `em` (email) | trim, lowercase. (`John.Doe@x.com` → `john.doe@x.com`) |
| `ph` (phone) | digits only, include country code, no `+`/spaces/dashes. US: `14155551234` |
| `fn` / `ln` | trim, lowercase, strip punctuation |
| `ct` (city) | lowercase, no spaces/punctuation |
| `st` (state) | lowercase 2-letter code (`ca`) |
| `zp` (zip) | first 5 digits (US), lowercase |
| `country` | lowercase 2-letter ISO (`us`) |

```js
import crypto from 'crypto';
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
const hashEmail = e => sha256(e.trim().toLowerCase());
const hashPhone = p => sha256(p.replace(/\D/g,''));   // ensure country code prefix first
```

Never send raw PII unhashed. Empty/unknown field → omit the key entirely (don't send empty strings).

---

## 7. Deposit vs. balance handling

**DECISION (locked): One Purchase event, fired on the order's FIRST completed payment, valued at the FULL order total.**

An order is paid either in full (one payment) or via deposit-then-balance (two payments). We fire a single CAPI `Purchase`:

- **Trigger:** the **first** `payment.updated` → `COMPLETED` webhook for the order — i.e. the **pay-in-full** payment, or the **deposit** payment, whichever applies. Guard with "has this order already fired Purchase?" so it fires exactly once.
- **Why first payment:** firing on the deposit (not the later balance) keeps the conversion inside Meta's **7-day click window** (balance arrives days later and would frequently fall outside it). For pay-in-full orders there's only one payment, so this is moot.
- **Value:** the **full order total**, pulled from our stored order record — NOT the `amount_money` of the deposit payment.
- **event_id:** `purchase_{orderId}`.
- **Balance payment** (deposit orders only): fire **nothing** to Meta for ads (optionally an internal-only `BalancePaid` event for reconciliation). Do not fire a second `Purchase`.

**Accepted over-report (intentional):** ~10% of deposits never complete to balance. We knowingly count these at full value because that lead profile is exactly who we want Meta to optimize toward. No refund/cancellation wiring required for the ~10% — the over-report is a deliberate signal, not an error. (If cancellation rate ever climbs materially, revisit by wiring Square `refund.created` → CAPI refund.)

---

## 8. Dedup with the Pixel

- Fire a **client-side Pixel `Purchase`** on the thank-you page AND the **server-side CAPI `Purchase`**, both with the **identical `event_id`** and `event_name`.
- Meta dedupes within a 48-hour window on (`event_name` + `event_id`), counting one conversion and merging signals.
- The server event is the reliable one (fires even if the browser closes/ad-blocks); the Pixel event adds browser-side signal. Keep both.

---

## 9. Edge cases & QA checklist

- [ ] **Test mode first:** use `test_event_code` (Events Manager → Test Events) and confirm events arrive with `action_source: website`, value, currency, and a green/strong **Event Match Quality** score.
- [ ] **EMQ target:** aim for Match Quality ≥ "Good". If low, check phone country-code prefix and that `fbp` is being captured.
- [ ] **Remove `test_event_code` in production.**
- [ ] **Idempotency:** redelivered Square webhooks must not double-fire CAPI.
- [ ] **Only COMPLETED:** ignore non-completed `payment.updated` statuses.
- [ ] **Value units:** Square cents → Meta dollars (÷100).
- [ ] **IP/UA/fbp/fbc** come from stored form-load values, not the webhook request.
- [ ] **Missing fbc:** event still valid; don't block on it.
- [ ] **Timezone/event_time:** Unix seconds, use payment-completed timestamp; must be within 7 days of send.
- [ ] **Secrets:** CAPI access token + Square signature key server-side only.
- [ ] **7-day reminder for ops:** the faster a deposit is collected after first chat, the higher the attribution rate. Worth a rep nudge to close deposits promptly.

---

## 10. Build checklist (sequence)

1. CRM toggle: per-order choice of Pay-in-full / Deposit / Both, with **auto-generated Square link(s)** (`reference_id = orderId`, `order_id` set).
2. Order-form page: render order + edit, show configured payment option(s), open matching Square link.
3. `/api/attribution` endpoint — store fbp/fbc/ip/ua/event_id/PII + **full order total** per order.
4. Square `payment.updated` webhook subscription + signature verification + idempotency.
5. CAPI sender (hashing + payload + v25.0 endpoint) fired on the order's **first** COMPLETED payment, valued at full total, with a "already fired?" guard.
6. Thank-you-page Pixel `Purchase` with matching `event_id`.
7. Test Events validation → confirm match quality → remove test code → ship.
8. (Optional) `BalancePaid` internal event on balance payment; `refund.created` handling only if cancellation rate climbs.

---

### Sources
- [Meta — Conversions API: Using the API](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/)
- [Meta — Server Event Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/)
- [Meta — Graph API v25.0 (current)](https://developers.facebook.com/docs/graph-api/changelog/version25.0/)
- [Square — payment.updated Webhook reference](https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated)
- [Square — Payments API Webhooks](https://developer.squareup.com/docs/payments-api/webhooks)
