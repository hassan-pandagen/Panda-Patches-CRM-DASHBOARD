# Claude Code brief — Digitizer portal & production roles

**Date:** 2 Sept 2026
**System:** Panda Patches OS V2.5 · Supabase project `uxgzlneefybifvccfhwp`
**Portal:** `https://portal.pandapatches.com`

Build in phase order. Phase 1 is the unlock — freelance digitizer accounts
cannot be created until it ships. Do not start a later phase before an earlier
one passes its checks.

---

## Context in five lines

Digitizing work is currently dispatched by email and has no consistent path.
Three freelance digitizers have been hired and will work from home. They need
portal accounts that show them their assigned work and nothing else — no
customer identity, no financials, no other orders. A production supervisor
starts today; Zahid Bhai runs production until that person is trained.

---

## Guardrails — read before writing code

1. **Never expose customer identity to a Digitizer.** Not name, email, phone,
   address, order value, or the customer conversation thread. Build the
   digitizer view as its own route with its own query — do not reuse the
   existing order detail query and hide fields in the client.
2. **Never delete a mockup file or revision.** No delete endpoint, no delete UI,
   no admin override. Uploads create new revisions.
3. **Enforce every gate server-side.** A disabled button is not a gate.
4. **Do not change existing statuses, roles, or permissions** beyond what this
   brief specifies. Sales Agent, Shipping and Admin behaviour stays as-is.
5. **Reuse, don't rebuild.** The Sales Agent reassignment component, the email
   template system, the audit trail and the status filter rail all exist and
   work.
6. **Never add a role before Task 0.2 is done.** `role` gates access
   independently of the eleven permission flags, in 20+ places, and several of
   those checks are *negative* (`role !== 'PRODUCTION'`). A new role passes
   every negative check by default, so creating `DIGITIZER` as configuration
   silently grants capabilities rather than withholding them.

---

## People

| Account | Name | Role after this work | Notes |
|---|---|---|---|
| `lilcustomerzdesign@gmail.com` | Zahid Bhai | `PRODUCTION_SUPERVISOR` | Interim. Keep `View All Orders` — do not scope down |
| `lilcustomize550@gmail.com` | Saad | `DIGITIZER` | Scope down with the freelancers |
| *(new hire, starts today)* | TBC | `PRODUCTION_SUPERVISOR` | Create with the supervisor permission set — do **not** start from the Admin preset |
| *(3 freelancers)* | TBC | `DIGITIZER` | One account each. Create only after Phase 1 ships |

---

## Existing system facts

**Roles enum:** `SALES_AGENT`, `PRODUCTION`, `SHIPPING`, `ADMIN`

**Permissions (11):** `Manage Users`, `Create Orders`, `View All Orders`,
`View Own Orders Only`, `Change Status`, `Edit Financials`, `Edit Production`,
`Delete Orders`, `View Reports`, `View Shipping`, `Clock Only`

**Statuses:** `NEW_ORDER`, `AWAITING_CUSTOMER_APPROVAL`, `REVISION`,
`IN_PRODUCTION`, `QUALITY_ASSURANCE`, `SHIPPED`, `DELIVERED`, `REMAKE`,
`CANCELLED`, `REFUNDS` · flags `URGENT`, `Overdue`, `Unassigned`

**Order file fields:** `mockup_urls`, `customer_attachment_urls`,
`production_file_urls`, `shipping_attachment_urls`

**Storage:** bucket `order-attachments`, paths like
`customer-refs/PP-11399/<timestamp>_<name>.pdf`

**Email:** templates New Order Confirmation, Mockup Ready, Revision In Progress,
Production Started, Shipped, Delivered, Remake. `CUSTOMER_MOCKUP_READY` already
auto-fires on transition to `AWAITING_CUSTOMER_APPROVAL`.

**Order route:** `/order/PP-XXXXX`

---

# Phase 0 — Prerequisites

**Both block everything. Neither is optional.**

### Task 0.1 — Close the role-check hole

**Do this before any new role exists anywhere in the codebase.**

`role` gates access independently of the eleven permission flags, in 20+ call
sites. Confirmed examples:

```
AdminRoute.tsx:25         if (role !== UserRole.ADMIN) → redirect
AssignOrderSection:44     canAssign = role === ADMIN
EmailLogsSection:82       canSendEmail = role !== 'PRODUCTION' && role !== 'SHIPPING'
AllOrdersPage:217         row scoping by role, not permission
Sidebar / Navbar          Activity, Inbox, New Order, Patch Generator
```

Several are **negative checks**. A role that did not exist when the check was
written passes it. Adding `DIGITIZER` without fixing this grants outside
freelancers the ability to email customers directly, plus Activity, Inbox and
New Order — the exact opposite of this brief's intent, silently.

Required:

1. **Audit every `role` comparison in the codebase.** Enumerate all of them
   before changing any.
2. **Convert every negative check to a positive allowlist.** Default deny.
   ```
   // before
   canSendEmail = role !== 'PRODUCTION' && role !== 'SHIPPING'
   // after
   canSendEmail = [ADMIN, SALES_AGENT].includes(role)
   ```
3. **Constrain the column.** `role` is currently free text — no enum, no CHECK.
   Add a Postgres enum or CHECK constraint so an unknown role cannot be
   inserted at all.
4. **Add a default-deny fallback** for any role not explicitly listed in a
   check.

**Acceptance:** grep the codebase for `role !==` and `role != ` → zero results
in access-control paths. Insert a junk role value directly via SQL → rejected by
constraint.

### Task 0.2 — Make `order-attachments` private

Bucket is currently public: `/storage/v1/object/public/order-attachments/…`
returns files with no authentication.

- Convert to a private bucket
- RLS policies: authenticated users may read files for orders they can see
- Serve in-app file links as short-lived signed URLs (15 min)
- Migrate existing objects; update stored absolute public URLs

**Email images: split buckets. Decided by Imran, 2 Sept.**

Customer emails embed mockup images from this bucket. Email clients cannot
authenticate and short-lived signed URLs expire before many customers open the
mail, so a straight switch to private breaks every image in every historical and
future customer email. Therefore:

| Bucket | Visibility | Holds | Path scheme |
|---|---|---|---|
| `order-attachments` | **Private** | Source artwork, customer reference files, production files, QC and completion photos, work orders | Existing paths |
| `email-assets` | **Public** | Only mockup images that must render inside a customer email | **Random UUID per file** — never order number, never original filename |

Rules:

1. A file lands in `email-assets` only when it is embedded in outbound customer
   email. Nothing else goes there.
2. `email-assets` paths must be random UUIDs. The current scheme —
   `customer-refs/PP-11399/<timestamp>_<name>.pdf` — is enumerable by order
   number, which is why the present bucket is browsable to anyone who guesses.
   Removing that is half the security win.
3. Copy the image into `email-assets` at send time; never move the canonical
   file out of the private bucket.
4. Migrate existing objects into the private bucket. Existing emails keep
   working via the public copies.

**Acceptance:** any source-artwork URL in a signed-out incognito window → fails.
Images in a customer email sent before and after the change → still render.
Guessing `email-assets` paths from an order number → impossible.

---

# Phase 1 — MVP: digitizer accounts can be created

Everything needed to safely onboard the freelancers, and nothing more.

### Task 1.1 — Add two roles

**Blocked by Task 0.1.** Do not begin until the negative role checks are gone
and the column is constrained. This is engineering, not configuration — the
audit that called it configuration was wrong.

Add `DIGITIZER` and `PRODUCTION_SUPERVISOR` to the roles enum. Add matching
presets in the Create/Edit User form.

Then, for each of the 20+ role call sites enumerated in Task 0.1, decide
explicitly whether the two new roles belong in that allowlist. `DIGITIZER`
belongs in almost none. Specifically it must **not** appear in the allowlist for
sending email, Activity, Inbox, New Order, Patch Generator, admin routes, or
order assignment.

| Role | Permissions |
|---|---|
| `DIGITIZER` | `View Own Orders Only`, `Edit Production`, `Clock Only` |
| `PRODUCTION_SUPERVISOR` | `View All Orders`, `Change Status`, `Edit Production`, `View Shipping`, `Clock Only` |

`DIGITIZER` must never carry `View All Orders`, `Edit Financials`,
`Manage Users`, `Delete Orders`, or `Create Orders`.

**Acceptance:** both roles selectable in Create User; presets apply the exact
sets above.

### Task 1.2 — Digitizer assignment field

`View Own Orders Only` currently scopes by sales-agent assignment. Digitizers
are not sales agents, so a separate field is required.

- Add `orders.assigned_digitizer_id` (FK to users, nullable)
- Do **not** reuse or overwrite the sales-agent assignment field — it drives
  attribution and the workload picker

**Scoping rule for a `DIGITIZER` — two conditions, both required:**

```sql
assigned_digitizer_id = auth.uid()
AND status IN ('DIGITIZING', 'REVISION', 'AWAITING_CUSTOMER_APPROVAL')
```

Visibility is **bounded by the active digitizing window**, not by assignment
alone. An order stays visible while the customer is deciding, so the digitizer
can see their submission is pending and catch their own mistake before the
customer does. The moment it resolves — customer approves, supervisor marks a
revision final, production starts — it leaves that digitizer's account entirely.
When a change request sends it back to `DIGITIZING`, it reappears.

While in `AWAITING_CUSTOMER_APPROVAL` the order is **read-only** to the
digitizer: no uploads, no resubmission. A correction at that point goes through
the supervisor, so it can't cross with a customer response already in flight.

Consequences to build correctly:

1. **Disappearing is not deleting.** The order, its files and its full revision
   history are retained in the system exactly as before. Only that digitizer's
   read access ends. The evidence model in Phase 2 is unaffected.
2. **The transition must revoke immediately.** A digitizer holding the page open
   when the status changes must lose the data on next fetch, not on next login.
3. **Reassignment revokes too.** If a supervisor moves an order to a different
   digitizer, it vanishes from the first one — covered by the assignment clause,
   but test it explicitly.
4. **`REMAKE` is not in the list.** A remake re-runs production from the
   approved revision; it does not return to digitizing. If a remake ever needs
   fresh artwork, the supervisor reassigns it, which sets status back to
   `DIGITIZING` and brings it back into scope by the normal rule.

**Acceptance:** a digitizer's order query returns only rows meeting **both**
conditions, and still returns only those rows when called directly against the
API with a valid token. Move an assigned order to `IN_PRODUCTION` → it
disappears from that digitizer's queue and its detail route returns nothing.

### Task 1.3 — `DIGITIZING` status

Add `DIGITIZING` to the status enum and the `/orders` filter rail.

Transitions:
- `NEW_ORDER → DIGITIZING` when a supervisor assigns a digitizer
- `DIGITIZING → AWAITING_CUSTOMER_APPROVAL` when the digitizer submits a mockup
  (fires the existing `CUSTOMER_MOCKUP_READY` template)
- `REVISION → DIGITIZING` when a supervisor sends a change request back

### Task 1.4 — Supervisor assignment UI

On the order detail page, add a "Assign Digitizer" panel beside the existing
Assign Sales Agent panel. Clone that component — including the active-order
counts and "Best Choice" ordering — filtered to `DIGITIZER` accounts.

Assignment sets `assigned_digitizer_id`, sets status to `DIGITIZING`, and sends
the assignment email (Task 1.6).

### Task 1.5 — Digitizer view

New route, new query. **Not** the existing order page.

**Queue** — assigned orders, due date ascending, urgent first. Each row: order
number, design name, patch type, size, due date, urgent flag, status.

**Detail** — shows **only**:
- Order number
- Design name
- Patch type
- Size
- Due date and urgent flag
- Customer reference files (signed URLs)
- Current change request text, when present
- Revision history for this order
- Upload controls: mockup files, production files
- Submit button

**Must not appear in the response payload**, not merely hidden: customer name,
email, phone, address, any financial field, sales agent, lead source, Meta data,
customer conversation.

Submit → status `AWAITING_CUSTOMER_APPROVAL`, customer email fires from the
system. The digitizer never sees the recipient.

### Task 1.6 — Assignment email

Internal template to the assigned digitizer: order number, patch type, size, due
date, portal link. **No customer information.**

### Phase 1 acceptance test

Sign in as a `DIGITIZER` account and, from the browser console:

1. Query the orders table directly → only assigned rows
2. Query the customers table → nothing
3. Fetch another digitizer's order by id → nothing
4. Fetch an order-attachment URL while signed out → fails
5. Inspect the digitizer detail network response → contains no customer fields

**All five must pass before freelancer accounts are created.**

---

# Phase 2 — Mockup revision model

The evidence layer. Build before the QC and PDF work.

### Purpose

A customer approves a mockup, then later asks for something different. The
system must show exactly which revision was approved and when.

### Task 2.1 — Schema

```sql
mockup_revisions
  id                    uuid pk
  order_id              fk orders
  revision_number       int          -- 1, 2, 3…
  file_urls             text[]       -- immutable
  uploaded_by           fk users     -- digitizer
  uploaded_at           timestamptz
  change_request        text         -- written by supervisor; null on rev 1
  sent_to_customer_at   timestamptz
  customer_response     text         -- approved | changes_requested | null
  customer_responded_at timestamptz
  is_final              boolean      -- supervisor only
  superseded_by         uuid         -- fk mockup_revisions, nullable

orders
  approved_revision_id  uuid         -- fk mockup_revisions, nullable
```

### Task 2.2 — Rules

1. Every mockup upload creates a new row. Never update `file_urls` on an
   existing row.
2. No delete path for revisions or their files. Any role.
3. `is_final` writable only by `PRODUCTION_SUPERVISOR` and `ADMIN`.
4. Customer approval writes `orders.approved_revision_id` with the specific
   revision id.
5. Transition to `IN_PRODUCTION` requires `approved_revision_id IS NOT NULL`.
   Server-side.

### Task 2.3 — Display

Order detail, above the fold once set:

> **Approved: Revision 2** — approved by customer 4 Sept 2026, marked final by
> [supervisor name]. [view file]

Superseded revisions listed beneath, greyed, numbered, with dates and uploader.
Same history rendered in the customer conversation thread.

### Task 2.4 — Change requests

Supervisor writes `change_request` on the order and sends it back. Status
`AWAITING_CUSTOMER_APPROVAL → REVISION → DIGITIZING`, routed to the same
digitizer. The text appears on their detail view.

Digitizers never read customer messages directly — the supervisor writes the
request.

---

# Phase 3 — Production controls

### Task 3.1 — QC and completion photos

Add `qc_photo_urls` and `completion_photo_urls` (private storage).

Hard gates, server-side, no override:
- No transition out of `QUALITY_ASSURANCE` without ≥1 QC photo
- No "Mark Production Complete" without ≥1 completion photo

### Task 3.2 — Work order PDF

Button on supervisor's order view. Generates, stores to the order's files, opens.

Contents:
- **Header:** order number large, QR code to `/order/PP-XXXXX`, created date,
  ship-by date, `URGENT` banner when flagged
- **Specification:** patch type, size, **quantity**, **backing**, border/merrow,
  thread/yarn colours, design name, special instructions
- **Artwork:** approved mockup image printed large, with revision number and
  approval date
- **Floor sign-off, blank fields:** operator, start time, finish time, QC
  pass/fail with initials, quantity produced, quantity rejected

Quantity and backing get visual weight — largest text in the specification
block. They are the two most expensive things to get wrong.

Regeneration creates a new version; never overwrite.

**Check first:** border/merrow and thread colours were not visible as structured
fields on PP-11399. If they are free text, add structured fields — prerequisite
for this task and for Task 1.5.

### Task 3.3 — Ready-to-ship email

Internal template to a **configurable** address (not hardcoded), fired on
production complete: order number, quantity, completion photos.

---

## Out of scope

Do not build in this work:

- Production-vendor routing (PVC and similar) — deferred
- Any change to Sales Agent, Shipping or Admin behaviour
- Customer-facing mockup email — already exists and already fires
- Bulk-closing the 31 stale orders — separate task, `/bulk-close` exists

---

## Rollout

Freelancer accounts are created only after the Phase 1 acceptance test passes,
one account per person, `DIGITIZER` role.

Because there is no consistent process today, set a cutover date after Phase 1:
from that day, mockups move only through the portal and email dispatch stops.
A half-migrated process is worse than either version — work sits in whichever
path nobody is watching.
