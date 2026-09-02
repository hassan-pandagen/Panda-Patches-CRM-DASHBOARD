# Claude Code brief — Digitizer portal & production roles

**Date:** 2 Sept 2026 · **Revision 5**
**System:** Panda Patches OS V2.5 · Supabase project `uxgzlneefybifvccfhwp`
**Portal:** `https://portal.pandapatches.com`

Build in phase order. Phase 1 is the unlock — freelance digitizer accounts
cannot be created until it ships.

**Changes in revision 5** (all from Imran, 2 Sept): storage scope narrowed to
machine files only; mockups are sent by the supervisor, not the digitizer;
digitizer work covers quotes as well as orders; internal email reduced to two.

---

## Context in six lines

Digitizing work is dispatched by email today and has no consistent path. Three
freelance digitizers have been hired and will work from home. They need portal
accounts showing their assigned work and nothing else. A production supervisor
starts today; Zahid Bhai runs production until that person is trained. Panda
Patches offers a free mockup before payment, so digitizing work starts at
**quote** stage, not only at order stage.

---

## Guardrails

1. **Never expose customer identity to a Digitizer.** Not name, email, phone,
   address, order value, or the customer conversation. Build the digitizer view
   as its own route with its own query — never the existing order query with
   fields hidden client-side.
2. **Digitizers never send anything to a customer.** They produce files. The
   supervisor sends.
3. **Never delete a mockup file or revision.** No delete endpoint, no delete UI,
   no admin override.
4. **Enforce every gate server-side.** A disabled button is not a gate.
5. **Do not change existing statuses, roles, or permissions** beyond what this
   brief specifies.
6. **Never add a role before Task 0.1 is done.** `role` gates access
   independently of the permission flags, in 20+ places, and several checks are
   *negative* (`role !== 'PRODUCTION'`). A new role passes every negative check
   by default, so creating `DIGITIZER` as configuration would silently grant
   capabilities rather than withhold them.

---

## People

| Account | Name | Role after this work | Notes |
|---|---|---|---|
| `lilcustomerzdesign@gmail.com` | Zahid Bhai | `PRODUCTION_SUPERVISOR` | Interim. Keep `View All Orders` — do not scope down |
| `lilcustomize550@gmail.com` | Saad | `DIGITIZER` | Scope down with the freelancers |
| *(new hire, started 2 Sept)* | name on account creation | `PRODUCTION_SUPERVISOR` | Zahid covers the role until he is trained. Create with the supervisor set — do **not** start from the Admin preset, and do not wait for the name to build Task 1.1 |
| *(3 freelancers)* | TBC | `DIGITIZER` | One account each. Create only after Phase 1 ships |

---

## Existing system facts

**Roles:** `SALES_AGENT`, `PRODUCTION`, `SHIPPING`, `ADMIN` — free text, no
enum, no CHECK constraint.

**Permissions (11):** `Manage Users`, `Create Orders`, `View All Orders`,
`View Own Orders Only`, `Change Status`, `Edit Financials`, `Edit Production`,
`Delete Orders`, `View Reports`, `View Shipping`, `Clock Only`

**Statuses** (stored values — UI filter labels differ):
`PENDING_PAYMENT`, `NEW_ORDER`, `AWAITING_CUSTOMER_APPROVAL`,
`REVISION_REQUESTED`, `APPROVED`, `IN_PRODUCTION`, `QUALITY_ASSURANCE`,
`COMPLETED`, `SHIPPED`, `DELIVERED`, `REMAKE`, `FEEDBACK`, `CANCELLED`,
`REFUNDED` · flags `URGENT`, `Overdue`, `Unassigned`

**Order file fields:** `mockup_urls`, `customer_attachment_urls`,
`production_file_urls`, `shipping_attachment_urls`

**Storage:** bucket `order-attachments`, public, paths like
`customer-refs/PP-11399/<timestamp>_<name>.pdf`

**Structured fields:** `border_type` exists. **Thread colours do not** — one new
field required.

**Email:** templates New Order Confirmation, Mockup Ready, Revision In Progress,
Production Started, Shipped, Delivered, Remake. `CUSTOMER_MOCKUP_READY`
auto-fires on transition to `AWAITING_CUSTOMER_APPROVAL`.

**Routes:** `/order/PP-XXXXX`, `/quotes`, `/user-management`, `/orders`

---

# Phase 0 — Prerequisites

### Task 0.1 — Close the role-check hole

**Do this before any new role exists anywhere in the codebase.**

Confirmed call sites:

```
AdminRoute.tsx:25         if (role !== UserRole.ADMIN) → redirect
AssignOrderSection:44     canAssign = role === ADMIN
EmailLogsSection:82       canSendEmail = role !== 'PRODUCTION' && role !== 'SHIPPING'
AllOrdersPage:217         row scoping by role, not permission
Sidebar / Navbar          Activity, Inbox, New Order, Patch Generator
```

Required:

1. **Enumerate every `role` comparison** before changing any.
2. **Convert every negative check to a positive allowlist.** Default deny.
   ```
   // before
   canSendEmail = role !== 'PRODUCTION' && role !== 'SHIPPING'
   // after
   canSendEmail = [ADMIN, SALES_AGENT, PRODUCTION_SUPERVISOR].includes(role)
   ```
3. **Constrain the column** — Postgres enum or CHECK, so an unknown role cannot
   be inserted.
4. **Default-deny fallback** for any role not explicitly listed.

**Acceptance:** grep for `role !==` and `role != ` → zero results in
access-control paths. Insert a junk role via SQL → rejected.

### Task 0.2 — Protect machine files only

**Status: code complete, bucket flip deliberately held. 112 tests, tsc clean,
build passes.**

**Scope decided by Imran, 2 Sept.** Mockup JPEGs and customer reference files
stay **public and unchanged**. Links in existing emails keep working, no
migration.

The asset worth protecting is the **production / digitizing machine files** —
the stitch files that let anyone reproduce a patch.

#### Corrected facts (dev, source + live check)

- **`production-files` already exists.** It is public and holds **528 objects**.
  A signed-out fetch with no key returned **HTTP 200, 144,005 bytes**. The
  machine files are exposed right now. This task is a **flip**, not a
  create-and-migrate — less work than originally written.
- **`production_file_urls` is not the addressing.** Only 20 orders have the
  column set, and those rows mix `production-files` and `order-attachments`
  URLs. Real addressing is **folder convention**: `orders/<id>` and
  `orders/<id>/completion`.

#### Approach taken

Stored URLs are `/object/public/…` strings written at upload time, so flipping
the bucket first would instantly break the order page's production sections and
the production-complete email — the same failure mode the payment-token
lockdown was split in two to avoid.

- `storageService.ts` — `toSignedUrl()` re-signs at render time. **Stored values
  untouched**, which is what makes the flip reversible.
- `FileUpload.tsx` — signs for display; no-op for `order-attachments`.
- Migration written, **not applied**.

**Sequence (in the migration header):** ship frontend → verify an order's files
still open → flip → re-verify.

#### Access to `production-files`

- `ADMIN`, `PRODUCTION_SUPERVISOR`, `SALES_AGENT` — always
- `DIGITIZER` — **only while the work item is inside their active window**
  (Task 1.2). Access ends when the order moves to production; returns only if a
  supervisor reassigns
- Signed out — never

Re-orders with changes: supervisor reassigns, which reopens access by the normal
window rule. No separate mechanism.

#### Completion photos — signed for 30 days

242 of the 528 objects are completion photos, not machine files, but they sit in
the same bucket and so go private with it. `INTERNAL_PRODUCTION_COMPLETE`
embeds them as `<img>`, and an email client cannot authenticate.

Dev's call: sign those for **30 days** rather than 15 minutes, because an inbox
image has to resolve whenever someone gets round to reading it. After 30 days
they stop; the photos remain on the order in the portal, which is the durable
copy. Chosen over attaching them because attachments share a 6MB budget with the
artwork — the cause of the earlier send-email memory outage.

**Accepted.** 30-day signing stands. It is an internal-only email, the photos
remain on the order in the portal as the durable copy, and attaching them would
put them back in the 6MB budget that caused the send-email memory outage.

**Acceptance:** a `production-files` URL in a signed-out incognito window →
fails. A digitizer can fetch machine files for an item in their window, and
cannot once it leaves. Existing mockup URLs in old customer emails → still
render.

> **One risk noted, decision respected.** Customer reference files stay public
> and include client-supplied logos and artwork. Imran's position is that the
> machine files are the asset worth protecting. Flagged once; not treated as
> blocking.

---

# Phase 1 — MVP: digitizer accounts can be created

### Task 1.1 — Add two roles

**Blocked by Task 0.1.** This is engineering, not configuration.

| Role | Permissions |
|---|---|
| `DIGITIZER` | `View Own Orders Only`, `Edit Production`, `Clock Only` |
| `PRODUCTION_SUPERVISOR` | `View All Orders`, `Change Status`, `Edit Production`, `View Shipping`, `Clock Only` |

`DIGITIZER` must never carry `View All Orders`, `Edit Financials`,
`Manage Users`, `Delete Orders`, or `Create Orders`.

For each role call site from Task 0.1, decide explicitly whether the new roles
belong. `DIGITIZER` belongs in almost none — specifically **not** in the
allowlist for sending email, Activity, Inbox, New Order, Patch Generator, admin
routes, or assignment.

### Task 1.2 — Digitizer work items (quotes *and* orders)

Digitizing starts at quote stage — Panda Patches offers a free mockup before
payment — so assignment cannot live on `orders` alone.

Create a single work-item table rather than duplicating fields on both:

```sql
digitizer_assignments
  id                uuid pk
  quote_id          uuid null   -- exactly one of quote_id / order_id is set
  order_id          uuid null
  digitizer_id      fk users
  assigned_by       fk users    -- supervisor
  assigned_at       timestamptz
  due_at            timestamptz
  released_at       timestamptz null  -- set when the item leaves the window
  CHECK (num_nonnulls(quote_id, order_id) = 1)
```

**Visibility rule for a `DIGITIZER` — both conditions required:**

```sql
digitizer_id = auth.uid()
AND released_at IS NULL
AND (
  order_id IS NOT NULL AND order.status IN
      ('DIGITIZING', 'REVISION_REQUESTED', 'AWAITING_CUSTOMER_APPROVAL')
  OR
  quote_id IS NOT NULL AND quote.mockup_state IN
      ('MOCKUP_ASSIGNED', 'MOCKUP_SENT', 'REVISION_REQUESTED')
)
```

Enforce in RLS, not only in queries.

Rules:

1. **Disappearing is not deleting.** The item, files and revision history are
   retained. Only that digitizer's read access ends.
2. **Revocation is immediate** — next fetch, not next login.
3. **Reassignment revokes** the previous digitizer. Test explicitly.
4. **`APPROVED` is deliberately excluded.** Approval is the finalisation moment;
   access ends there, not at production start. Six orders sit in `APPROVED` now.
5. **`REMAKE` is excluded.** A remake re-runs production from the approved
   revision. If it needs fresh artwork, the supervisor reassigns, which brings
   it back by the normal rule.
6. Do **not** reuse the sales-agent assignment field — it drives attribution and
   the workload picker.
7. **Gate the folder listing, not a column.** `production_file_urls` is set on
   only 20 orders and mixes buckets, so it cannot be the access boundary. Files
   are addressed by folder convention — `orders/<id>` and
   `orders/<id>/completion`. The window rule must gate storage listing and
   signing for those prefixes.

### Task 1.3 — `DIGITIZING` status and quote mockup state

Add `DIGITIZING` to the order status enum and the `/orders` filter rail.

Add a mockup state to quotes: `NONE → MOCKUP_REQUESTED → MOCKUP_ASSIGNED →
MOCKUP_SENT → APPROVED | REVISION_REQUESTED`.

Order transitions:
- `NEW_ORDER → DIGITIZING` on assignment
- `DIGITIZING → AWAITING_CUSTOMER_APPROVAL` when the **supervisor sends** the
  mockup (Task 1.6), firing the existing `CUSTOMER_MOCKUP_READY` template
- `REVISION_REQUESTED → DIGITIZING` when sent back

### Task 1.4 — Supervisor assignment UI

Add an "Assign Digitizer" panel on **both** the order detail page and the quote
detail page. Clone the existing Sales Agent reassignment component, including
active-count ordering, filtered to `DIGITIZER` accounts.

Assignment creates a `digitizer_assignments` row and sets the status or mockup
state.

### Task 1.5 — Digitizer view

New route, new query. Not the existing order page.

**Queue** — assigned items, due date ascending, urgent first. Row: reference
number, design name, patch type, size, due date, urgent flag, state.

**Detail** — shows **only**:
- Reference number (quote or order)
- Design name, patch type, size
- Customer reference files
- Current change request, when present
- Revision history for this item
- Upload: mockup files, production files
- **No send button** — see Task 1.6

**Must not be present in the response payload:** customer name, email, phone,
address, any financial field, sales agent, lead source, Meta data, customer
conversation.

Read-only while in `AWAITING_CUSTOMER_APPROVAL` / `MOCKUP_SENT`: visible so the
digitizer can see it is pending, but no uploads. A correction at that point goes
through the supervisor, so it cannot cross with a customer response in flight.

### Task 1.6 — Sending is the supervisor's action

**Changed 2 Sept.** Earlier drafts had the digitizer trigger the customer send.
They do not.

- Digitizer uploads → item enters "ready to send", visible to the supervisor
- **Supervisor sends** the mockup to the customer
- A `SALES_AGENT` may also send when needed — allowed, not the default
- `DIGITIZER` must never appear in the send allowlist

This also removes the digitizer's last route to customer contact, which makes
Guardrail 1 structural rather than a matter of hidden fields.

### Phase 1 acceptance test

Sign in as a `DIGITIZER` and, from the browser console:

1. Query orders directly → only assigned rows in-window
2. Query customers → nothing
3. Fetch another digitizer's item → nothing
4. Fetch a `production-files` URL while signed out → fails
5. Inspect the digitizer detail response → no customer fields
6. Attempt to send a customer email → rejected server-side

**All six must pass before freelancer accounts are created.**

---

# Phase 2 — Mockup revision model

A customer approves a mockup, then later asks for something different. The
system must show exactly which revision was approved and when.

### Task 2.1 — Schema

```sql
mockup_revisions
  id                    uuid pk
  quote_id              uuid null
  order_id              uuid null
  revision_number       int
  file_urls             text[]       -- immutable
  uploaded_by           fk users
  uploaded_at           timestamptz
  change_request        text         -- written by supervisor; null on rev 1
  sent_by               fk users     -- supervisor or sales agent
  sent_to_customer_at   timestamptz
  customer_response     text         -- approved | changes_requested | null
  customer_responded_at timestamptz
  is_final              boolean      -- supervisor only
  superseded_by         uuid null

orders.approved_revision_id   uuid null  -- gates IN_PRODUCTION
```

### Task 2.2 — Rules

1. Every upload creates a new row. Never update `file_urls` in place.
2. No delete path for revisions or files. Any role.
3. `is_final` writable only by `PRODUCTION_SUPERVISOR` and `ADMIN`.
4. Customer approval writes `approved_revision_id` with the specific revision.
5. `IN_PRODUCTION` requires `approved_revision_id IS NOT NULL`. Server-side.

### Task 2.3 — Display

Order detail, above the fold once set:

> **Approved: Revision 2** — approved by customer 4 Sept 2026, marked final by
> [supervisor]. [view file]

Superseded revisions listed beneath — greyed, numbered, dated, with uploader.
Same history in the customer conversation thread.

### Task 2.4 — Change requests

Supervisor writes `change_request` and sends it back:
`AWAITING_CUSTOMER_APPROVAL → REVISION_REQUESTED → DIGITIZING`, routed to the
same digitizer. Digitizers never read customer messages directly.

---

# Phase 3 — Production controls

### Task 3.1 — QC and completion photos

Add `qc_photo_urls` and `completion_photo_urls`, private.

Hard gates, server-side, no override:
- No transition out of `QUALITY_ASSURANCE` without ≥1 QC photo
- No "Mark Production Complete" without ≥1 completion photo

### Task 3.2 — Work order PDF

Button on the supervisor's order view. Generates, stores to the order's files,
opens.

- **Header:** order number large, QR to `/order/PP-XXXXX`, created date, ship-by
  date, `URGENT` banner
- **Specification:** patch type, size, **quantity**, **backing**, `border_type`,
  thread colours *(new field required)*, design name, special instructions
- **Artwork:** approved mockup large, with revision number and approval date
- **Floor sign-off, blank:** operator, start, finish, QC pass/fail with initials,
  quantity produced, quantity rejected

Quantity and backing get the largest text in the specification block.
Regeneration creates a new version; never overwrite.

### Task 3.3 — Internal email: two only

**Decided by Imran, 2 Sept.** Internal notification is reduced to two emails.
Everything else the team needs, they see in the portal.

| # | Trigger | To | Contents |
|---|---|---|---|
| 1 | New order arrives | Internal team list | Order number, patch type, quantity, value |
| 2 | Production started | Internal team list | Order number, quantity, due date |

**No digitizer assignment email** — digitizers see their queue in the portal.
That is the point of the portal.

**No "ready to ship" email.** An earlier instruction asked for one on production
complete. Imran's later instruction was two internal emails, and that one is not
among them, so it is cut. Shipping works from the portal queue rather than an
inbox — consistent with the whole reason for building this.

Consequence to watch after cutover: Haseeb (`haseebghaffar009@gmail.com`, the
only Shipping account) currently has no push signal that an order is ready. He
must have a portal view that shows orders in `COMPLETED` awaiting dispatch. If
that view doesn't exist, build it — otherwise finished orders sit unnoticed and
the 31-stuck-order problem repeats in a new place.

`INTERNAL_PRODUCTION_COMPLETE` still exists and still carries the completion
photos; it is not a "ready to ship" instruction to a person.

Customer-facing emails are unaffected and keep firing as they do today.

---

## Out of scope

- Production-vendor routing (PVC and similar) — deferred
- Any change to Sales Agent, Shipping or Admin behaviour beyond Task 0.1
- Bulk-closing the 31 stale orders — `/bulk-close` exists, separate task

---

## Rollout

Freelancer accounts are created only after the Phase 1 acceptance test passes,
one account per person, `DIGITIZER` role.

**Mockup files are produced by digitizers only.** Sales agents may attach
customer-supplied references and may send a mockup when needed, but must not
produce mockups. This is a behaviour change — Shuja uploaded a
freelancer-produced mockup on PP-11399 against instruction. Tell the agents
before the system stops them.
