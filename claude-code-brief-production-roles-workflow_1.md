# Brief — Production supervisor & digitizer roles, order workflow

**Date:** 2 Sept 2026 · **Revision 2** — verified against the live portal
**From:** Imran Raza (CEO)
**System:** Panda Patches OS V2.5, Supabase-backed
**Status:** Ready for dev. Two security findings must be resolved first — §0.

Revision 1 was written blind. This revision replaces its assumptions with what
is actually in the portal. **Most of what was specified already exists.** The
real work is much smaller than revision 1 implied, and is concentrated in two
places that revision 1 did not anticipate.

---

## 0. Two findings that come before the feature

### 0.1 External digitizers currently have "View All Orders"

`/user-management` shows twelve accounts across four roles: ADMIN, Sales Agent,
Shipping, Production.

Two accounts hold the **Production** role:

| Account | Name | Permissions shown |
|---|---|---|
| `lilcustomerzdesign@gmail.com` | Zahid Bhai | View Shipping, **View All Orders**, +1 |
| `lilcustomize550@gmail.com` | Saad | View Shipping, **View All Orders**, +1 |

`lilcustomerzdesign@gmail.com` is the digitizing vendor named in the
mockup-before-payment brief — the one that brief specifies must receive **blind**
emails carrying no customer information.

That account can currently see every order in the system, and an order detail
page carries customer name, email, phone and full shipping address. The blind
policy is written into an approved brief and is not in force in the product.

Whether that's acceptable is your call, not a technical question — these may be
long-trusted people. But it should be a decision you've made, rather than a
default nobody chose. The `+1` permission is not visible in the table; check it
before deciding.

### 0.2 Order attachments are on a public storage bucket

From the PP-11399 audit trail, customer artwork is stored at:

```
https://uxgzlneefybifvccfhwp.supabase.co/storage/v1/object/public/
  order-attachments/customer-refs/PP-11399/1788290323763_YATES.pdf
```

`/object/public/` means **no authentication**. Anyone holding the URL can fetch
the file, signed in or not. The path is guessable in structure — order number
plus timestamped filename.

This matters twice over. It's a live exposure of customer artwork, some of it
client logos under NDA-ish expectations. And it means **the blind-digitizer
design in this brief cannot be delivered by storage permissions**, because the
storage layer currently has none. Scoping the UI while the bucket stays public
would be security theatre.

Fix before building the digitizer view: move `order-attachments` to a private
bucket with RLS policies, and serve files through short-lived signed URLs.

---

## 1. What already exists

Revision 1 specified a lot that is already built. Confirmed in the portal:

| Capability | Status |
|---|---|
| Roles as data, not hardcoded | **Exists** — ADMIN / Sales Agent / Shipping / Production |
| Granular permission flags per user | **Exists** — Manage Users, Create Orders, View Shipping, View All Orders, … |
| Order assignment with workload-aware picker | **Exists** — for Sales Agents, shows active-order counts and flags "Best Choice" |
| Structured `BACKING` field | **Exists** — PP-11399 reads "Iron-On" |
| Structured patch type, quantity, size, design name | **Exists** |
| Field-level audit trail with actor and timestamp | **Exists** — thorough |
| Status-triggered customer emails | **Exists** — auto-fired `CUSTOMER_MOCKUP_READY` on `AWAITING_CUSTOMER_APPROVAL` |
| Email template set | **Exists** — New Order Confirmation, Mockup Ready, Revision In Progress, Production Started, Shipped, Delivered, Remake |
| File arrays on the order | **Exists** — `mockup_urls`, `customer_attachment_urls`, `production_file_urls`, `shipping_attachment_urls` |
| "Mark Production Complete" action | **Exists** — button on order detail |
| Customer-facing conversation thread | **Exists** |

**Build on these. Do not create parallel systems.** In particular, the Sales
Agent reassignment component with its active-order counts is exactly the
assignment UI this brief needs — point it at a different role rather than
writing a second picker.

---

## 2. Existing status vocabulary

From the `/orders` filter rail:

```
NEW_ORDER · AWAITING_CUSTOMER_APPROVAL · IN_PRODUCTION · REVISION ·
QUALITY_ASSURANCE · SHIPPED · DELIVERED · REMAKE · CANCELLED · REFUNDS
```

Plus flags: `URGENT`, `Overdue`, `Unassigned`.

Revision 1 proposed a state machine. Nearly all of it is already here.

| Revision 1 proposed | Reality |
|---|---|
| `MOCKUP_SENT` | `AWAITING_CUSTOMER_APPROVAL` — already auto-emails the customer |
| Revision loop | `REVISION` already exists, with a `revisionNotes` field |
| `QC_ROUND_1` | `QUALITY_ASSURANCE` already exists |
| `PRODUCTION_COMPLETE` | "Mark Production Complete" button already exists |
| `IN_PRODUCTION`, `READY_TO_SHIP` | `IN_PRODUCTION`, `SHIPPED` |

**Exactly one new status is needed: `DIGITIZING`** — assigned to a digitizer,
work not yet submitted. It sits between `NEW_ORDER` and
`AWAITING_CUSTOMER_APPROVAL`, and it is the gap that currently makes digitizing
invisible in the pipeline.

Everything else in revision 1's state machine should be deleted from the plan.

---

## 3. What actually needs building

Five things.

### 3.1 Two roles

Create **Digitizer** and **Production Supervisor**.

Move `lilcustomerzdesign@gmail.com` and `lilcustomize550@gmail.com` from
Production to **Digitizer** — they are digitizers, not production supervisors,
and the current label is why they hold View All Orders.

Digitizer permission set: assigned orders only, no customer fields, no
financials. Explicitly **not** View All Orders.

### 3.2 `DIGITIZING` status plus digitizer assignment

New status. New assignment field alongside the existing sales-agent assignment —
reuse the workload picker component, filtered to Digitizer accounts.

`NEW_ORDER → DIGITIZING` on assignment.
`DIGITIZING → AWAITING_CUSTOMER_APPROVAL` on submit, firing the existing
`CUSTOMER_MOCKUP_READY` template. No new customer email needed.
`REVISION → DIGITIZING` on a change request, routing back to the same digitizer.

### 3.3 Digitizer view — the blind screen

The only genuinely new UI. A queue of assigned orders and a detail card showing
**only**: order number, design name, patch type, quantity, size, backing, due
date, urgent flag, customer reference files, revision notes, and mockup upload.

Not shown: customer name, email, phone, address, financials, Meta data, sales
agent, lead source, the customer conversation thread.

Build this as a **separate route and a separate query**, not the existing order
page with fields hidden. The existing order detail fetches everything; hiding it
client-side leaves it in the network response.

Depends on §0.2 — the file links on this screen must be signed URLs.

### 3.4 QC and completion photos, hard-gated

`QUALITY_ASSURANCE` exists as a status but has no photo capture. Add photo
upload, and gate the transition out of it on at least one photo. Same for
completion photos on "Mark Production Complete".

Hard gate, no override — the decision on record. Enforce server-side.

New file arrays: `qc_photo_urls`, `completion_photo_urls`. Both private.

### 3.5 Work order PDF

New. Button on the supervisor's order view, generates and stores to the order's
files, opens the PDF.

The order already holds everything needed. Required content:

**Header** — order number large, QR to the order URL, created date, ship-by
date, URGENT banner.

**Specification** — patch type, size, **quantity**, **backing**, border/merrow,
thread or yarn colours, design name, special instructions.

**Artwork** — approved mockup, printed large enough to check against, with
revision number.

**Floor sign-off, blank** — machine/operator, start and finish time, QC pass/fail
with initials, quantity produced, quantity rejected.

Quantity and backing carry visual weight on the page, not buried in a table —
they're the two most expensive things to get wrong.

**Gap to close:** border/merrow and thread colours were not visible as structured
fields on PP-11399. Confirm whether they exist; if not, that's a small schema
addition and a prerequisite for both §3.3 and §3.5.

---

## 4. Emails

Only two are new. Both internal.

| Trigger | To | Contents |
|---|---|---|
| Order assigned to digitizer | Digitizer | Order number, type, quantity, due date, portal link. **No customer information.** |
| Production complete | Internal, configurable | Order number, quantity, completion photos, "ready to ship" |

The customer-facing mockup email already exists and already fires automatically.
Do not add another.

---

## 5. Acceptance test

Before this ships, sign in as a Digitizer account and, from the browser console:

1. Query the orders table directly → must return only assigned rows
2. Query the customers table → must return nothing
3. Fetch another digitizer's assigned order by id → must return nothing
4. Fetch an order-attachment URL while signed out → **must fail**

Test 4 fails today. It is the §0.2 finding, and it is the one that makes the
other three meaningful.

---

## 6. Build order

1. **§0.2 — private bucket and signed URLs.** Blocks everything else.
2. **§0.1 — decide on digitizer visibility**, then §3.1 roles.
3. `DIGITIZING` status and digitizer assignment (§3.2).
4. Digitizer blind view (§3.3), against the acceptance test.
5. QC and completion photo gates (§3.4).
6. Work order PDF (§3.5).
7. Two internal emails (§4).

Steps 1 and 4 carry the risk. The rest is reuse of what V2.5 already does.

---

## 7. Separate observations, not part of this build

**31 orders stuck in SHIPPED / IN_PRODUCTION for 30+ days.** The dashboard flags
these itself. Standard delivery is 7–14 days, so these are near-certainly
delivered and never closed — which means delivery counts, the auto
SHIPPED→DELIVERED job in the dev queue, and the Homewood-style review-invite
trigger are all reading from bad data. There's a `/bulk-close` route already.

**Sales agent load is heavily skewed.** Danish 94 active orders, Manzoor 79,
Imran 69, Shuja 57 — against Hassan and Shabbar at 0. The picker already
surfaces this and already recommends the empty agents. Worth a look separately
from this build.

**PP-11399 is a PVC order with Iron-On backing.** See the separate note — this
contradicts a live site page and changes the chenille iron-on fix.
