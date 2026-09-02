# Brief — Production supervisor & digitizer roles, order workflow

**Date:** 2 Sept 2026 · **Revision 3**
**From:** Imran Raza (CEO)
**System:** Panda Patches OS V2.5, Supabase-backed
**Status:** Ready for dev, behind two security fixes (§0)

Revision 1 was written blind. Revision 2 corrected it against the live portal.
Revision 3 adds the target process and the mockup revision model, which is the
substantive new requirement.

**This brief defines a process rather than automating an existing one.** Mockup
handling today has no consistent path — sales agents, digitizers and admins all
touch it differently. Order PP-11399 had its mockup uploaded and its status moved
by a Sales Agent, not by either Production account. So this is a target state,
and rollout needs a cutover, not just a deploy.

---

## 0. Fix before building

### 0.1 Order attachments are on a public bucket

```
https://uxgzlneefybifvccfhwp.supabase.co/storage/v1/object/public/
  order-attachments/customer-refs/PP-11399/…
```

`/object/public/` means no authentication. Anyone with the URL reads the file.

This blocks the whole brief. A digitizer view that hides customer data while
artwork sits on an open bucket is theatre, and the revision model in §4 is
worthless as evidence if the files it points at can be fetched and replaced
outside the system.

Move `order-attachments` to a private bucket, RLS policies, short-lived signed
URLs.

### 0.2 Digitizer accounts hold View All Orders

`lilcustomerzdesign@gmail.com` (Zahid Bhai) and `lilcustomize550@gmail.com`
(Saad) carry the Production role: View Shipping, View All Orders, Edit
Production. They can read every order including customer name, email, phone and
address.

`View Own Orders Only` already exists as a permission. See the roles audit.

---

## 1. Target process

```
Order arrives (paid, or quote with mockup request)
  ↓
Supervisor reviews and assigns to a digitizer, with due date
  ↓  order → DIGITIZING
Digitizer works, uploads mockup                    → Revision 1
Digitizer sends to customer (system sends; digitizer never sees who)
  ↓  order → AWAITING_CUSTOMER_APPROVAL
       ├── Customer approves → supervisor marks Revision N FINAL
       │     ↓  order → IN_PRODUCTION
       └── Customer requests changes
             ↓  supervisor writes the change request onto the order
             ↓  order → REVISION → DIGITIZING
           Digitizer sees the request, uploads     → Revision 2
           (Revision 1 is retained, never deleted)
  ↓
Production runs
  ↓  order → QUALITY_ASSURANCE  — round-1 photo required, hard gate
  ↓
Supervisor marks production complete, uploads photos
  ↓  internal email: ready to ship
  ↓  order → SHIPPED (existing flow)
```

Note the asymmetry, which is deliberate: **the digitizer sends outward, the
supervisor takes the change request inward.** The digitizer never reads a
customer message, so nothing in a customer's words reaches them unfiltered.

---

## 2. Roles

Roles in V2.5 are labels; the eleven permission flags do the actual work. So
this is configuration plus two enum values, not a permissions rewrite.

### Digitizer

Assigned to `lilcustomerzdesign@gmail.com`, `lilcustomize550@gmail.com`, and
any future digitizer.

**Sees, per assigned order and nothing else:**

- Design name
- Patch type
- Size
- Source artwork / customer reference files
- The current change request, when there is one
- Full revision history for that order

**Can do exactly two things:** upload mockup files, and upload production files.
Submitting a mockup triggers the customer send.

**Never sees:** customer name, email, phone, address, order value, financials,
the customer conversation thread, the order list, or any other digitizer's work.

Permissions: `View Own Orders Only`, `Edit Production`, `Clock Only`.

**One recommendation against your spec.** You said design, size and patch type
only. Add **due date and the urgent flag** — you asked for a "what's the work for
today" screen, and without dates it can't sort, so every order looks equally
urgent. Neither field identifies the customer. Quantity and backing I've left
out: they don't change the digitizing work.

### Production Supervisor

New hire, new account, no inherited permissions.

Assigns work, writes change requests onto orders, marks revisions final, runs
QC, marks production complete, prints work orders.

Permissions: `View All Orders`, `Change Status`, `Edit Production`,
`View Shipping`, `Clock Only`. **No `Edit Financials`, no `Manage Users`,
no `Delete Orders`.**

Since this is a new hire: create the account on day one with these permissions,
and don't start from the Admin preset "for now." Cutting back later rarely
happens.

---

## 3. Status changes

Existing vocabulary already covers most of it: `NEW_ORDER`,
`AWAITING_CUSTOMER_APPROVAL`, `REVISION`, `IN_PRODUCTION`, `QUALITY_ASSURANCE`,
`SHIPPED`, `DELIVERED`, `REMAKE`, `CANCELLED`.

**One new status: `DIGITIZING`** — assigned, not yet submitted. This is the gap
that currently makes digitizing invisible in the pipeline.

Reuse the existing Sales Agent reassignment component, with its active-order
counts, pointed at Digitizer accounts.

---

## 4. Mockup revisions — the evidence model

This is the part that isn't a file upload.

The requirement: a customer approves a mockup, then later asks for something
different. You need to show precisely what was approved and when, so the answer
is "revision 2, approved 4 September, here it is" rather than an argument.

### Rules

1. **Files are never deleted and never overwritten.** Every upload creates a new
   revision. There is no delete action for anyone, including admins.
2. **Revisions are numbered and immutable** once sent to the customer.
3. **Only the supervisor marks a revision final.** Not the digitizer, not the
   sales agent, not automatically on customer approval.
4. **Customer approval records the revision id.** The approval is of *that
   revision*, not of the order in general. This is the whole point.
5. **Production cannot start** until the order has an approved revision.
6. **A change request after approval is a new request, not a correction.** The
   system should treat it as such, and so should the commercial conversation —
   post-approval changes are chargeable. Worth deciding the policy before the
   feature exists, or it'll get decided ad hoc under pressure.

### Data model

```
mockup_revisions
  id
  order_id
  revision_number          1, 2, 3…
  file_urls[]              immutable
  uploaded_by              digitizer user id
  uploaded_at
  change_request           text — written by supervisor; null on revision 1
  sent_to_customer_at
  customer_response        approved | changes_requested | null
  customer_responded_at
  is_final                 set by supervisor only
  superseded_by            revision id, nullable

orders
  approved_revision_id     FK, nullable — gates IN_PRODUCTION
```

### What it looks like on screen

On the order page, above everything else once set:

> **Approved: Revision 2** — approved by customer 4 Sept 2026, marked final by
> [supervisor]. [view file]

Superseded revisions stay visible, greyed, numbered, with dates. That list *is*
the record. It should also be visible in the customer conversation thread, so
the customer can see the same history you can.

The work order PDF prints the approved revision number and its approval date
alongside the image, so the paper on the floor and the record in the system
name the same thing.

---

## 5. Also to build

**QC and completion photos.** `QUALITY_ASSURANCE` exists as a status with no
photo capture. Add `qc_photo_urls` and `completion_photo_urls`, both private.
Hard gate: no transition out of QA without at least one photo, no production
complete without at least one. Enforce server-side — a disabled button is not a
gate.

**Work order PDF.** Button on the supervisor's order view; generates, stores to
the order's files, opens. Contents: order number large plus QR to the order,
ship-by date, URGENT banner; patch type, size, **quantity**, **backing**,
border/merrow, thread or yarn colours; approved mockup printed large with its
revision number and approval date; and blank floor sign-off fields — operator,
start/finish, QC pass/fail with initials, quantity produced, quantity rejected.

Quantity and backing get visual weight. They are the two most expensive things
to get wrong.

**Gap:** border/merrow and thread colours weren't visible as structured fields
on PP-11399. If they're free text, that's a small schema addition and a
prerequisite for the PDF.

**Two internal emails.** Assignment notification to the digitizer, carrying no
customer information. Ready-to-ship notification to a configurable internal
address — Haseeb is currently the only Shipping account. The customer-facing
`CUSTOMER_MOCKUP_READY` template already exists and already fires automatically;
don't add another.

---

## 6. Acceptance test

Sign in as a Digitizer and, from the browser console:

1. Query orders directly → only assigned rows
2. Query customers → nothing
3. Fetch another digitizer's order by id → nothing
4. Fetch an order-attachment URL while signed out → **must fail**
5. Attempt to delete a mockup revision → **must fail**

Tests 4 and 5 fail today. 4 is §0.1. 5 is the evidence model — if a revision can
be deleted, the record proves nothing.

---

## 7. Build order

1. §0.1 private bucket and signed URLs — blocks everything
2. §0.2 scope the two digitizer accounts
3. Digitizer and Production Supervisor roles, and the supervisor's account
4. `DIGITIZING` status and digitizer assignment
5. Mockup revision model (§4) — before the digitizer screen, because the screen
   is a view onto it
6. Digitizer screen, against the §6 acceptance test
7. QC and completion photo gates
8. Work order PDF
9. Two internal emails

**Then cut over.** Because there's no consistent process today, agree one date
after which mockups only move through this flow, and stop the old paths. A
half-migrated process is worse than either version of it — orders will sit in
whichever path nobody is watching.

---

## 8. Separate observations

**31 orders stuck in SHIPPED / IN_PRODUCTION 30+ days.** The dashboard flags
this itself, and `/bulk-close` exists. It corrupts delivery counts, the auto
SHIPPED→DELIVERED job, and the review-invite trigger. Worth clearing before the
new pipeline adds more states to keep clean.

**Sales agent load is heavily skewed** — Danish 94, Manzoor 79, Imran 69,
Shuja 57, against Hassan and Shabbar at 0. Some of that is the stuck orders.
Some may be permissions: Hassan holds 3 permissions where his peers hold 7. See
the roles audit.
