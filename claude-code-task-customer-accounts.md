# Claude Code Task — Customer accounts (customer-centric CRM): editable customer profile + linked orders

> **Superseded.** This plan investigated `orders.user_id` + `system_auto_claim` as the order↔customer link. That's no longer live — `orders.user_id` exists in the schema but nothing in the app or edge functions reads or writes it anymore. The customer-centric model this doc wanted got built, but on **normalized email** as the join key (via the `customers` table + `customer_profiles` for portal identity), not `user_id`.
>
> **Why the pivot:** `user_id` only exists once a portal account does, and a portal account only gets created when an order comes in (or an agent invites one) — so at the moment an order is created, there's often no `user_id` to link yet, especially for guest/no-account customers (this doc's own numbers show 262 of 333 customers had *never logged in*). Email, by contrast, is always present the instant an order or quote is created, regardless of whether a portal account exists — so it works as the join key across every order-creation path (CRM UI, Payment Form, website checkout, quote conversion) without waiting on auth state. This doc's own design already leaned this way (§ "Auto-merge existing data by email" below) — the final build just carried that all the way through instead of keying off `user_id`.

## What we're building (plain English)
Today the CRM is **order-centric**: each order stores its own copy of the customer's name, email, phone, and shipping address, and you edit those fields on the order. The same real person who ordered three times appears as three unrelated blobs of data.

We want it **customer-centric**: one **Customer Account** per real person. The admin opens that account, edits the customer's details **in one place**, and sees **all of that customer's orders** listed on the account, each clickable through to the order.

The business owner picked these product decisions (build to these):
1. **Editing = master record only.** The customer account is the source of truth for the customer's current/default contact details. Editing it does **not** rewrite the shipping address stored on past orders (those already shipped). New orders auto-fill from the account.
2. **Auto-merge existing data by email.** Consolidate duplicate customer records and baked-in order data into **one account per unique (normalized) email**. Flag ambiguous cases for human review rather than guessing.
3. **Upgrade the existing Customers page** (route `/portal-customers`) so each row opens that customer's account page. Don't build a separate parallel section.

---

## Current state — verified in the live app (read this before designing)
Observed by inspecting `portal.pandapatches.com` as admin. **Verify against the actual schema/code before implementing — treat the below as observations, not gospel.**

### Orders already store denormalized customer fields
On an order detail page (`/order/PP-11115`) the **Customer Information** block holds:
`customer_name`, `email` (customer's email, distinct from the sales-agent email), `phone` / mobile, `shipping_address`, plus `country`, `ccEmail` seen in the activity log.

Other order fields seen: `design_name`, `patches_type` (also a legacy `patchesType`), `quantity`, `size`, `design_backing` (also `designBacking`), `special_instructions`, `lead_source` (also `leadSource`), `status`, `sales_agent`, `total_amount` / `amount_paid` / remaining, internal costs, and a **Meta Conversions API** block (event id like `order_1042_purchase`).

> ⚠️ **Dual field names exist.** The activity log shows both `patches_type` **and** `patchesType`, `design_backing` **and** `designBacking`, `lead_source` **and** `leadSource` being written on the same save. Whatever we do must not break either variant. Audit this early.

### An order→customer link ALREADY EXISTS
The order activity log shows:
`Field Updated: user_id — Changed from "empty" to "609fb9ef-e975-493c-b120-f51a213bc5c0" — by system_auto_claim`.

So orders carry a **`user_id`** (UUID) that an auto-claim process fills in to link the order to a portal customer/user record. Orders are created from the **Payment Form via a Square webhook** (`ORDER_CREATED … via Square payment $200`), and `system_auto_claim` later attaches the `user_id`. **This is the linkage we build on — we are not inventing it from scratch.** Confirm: is `user_id` populated on all/most orders, or only auto-claimed ones? What is the match key (email)?

### A customer entity already exists (the portal users)
The **Customers** page (`/portal-customers`, nav label "Customers") lists customers with: name, email, **Company**, **Orders** count, **Total Spent**, **Last Login**, portal **Status**. Header stats: **Total Customers 333**, **Portal Active 71**, **Never Logged In 262**, **Total Revenue $80,800**. There's an **"Invite Customer"** action.

Implications:
- Orders **are** already aggregated per customer here (counts + total spent), so a customer↔order relationship is queryable today.
- These 333 are **portal login users** (71 have logged in; 262 never have) — i.e. this is likely backed by Supabase `auth.users` and/or a `customers`/`profiles` table keyed by the same UUID as `orders.user_id`.
- **The rows are NOT clickable** — `read_page` found no per-row link/button, only "Invite Customer" + search. So there is **no customer account/detail page today**. That's the core gap.

### Companies exist (B2B)
There's a `/companies` section and a **Company** column on the customers list (mostly empty for retail buyers). A customer may belong to a company. Keep this relationship intact; the account page should show/allow setting the customer's company.

### Stack
Next.js app + Supabase Postgres (consistent with prior work on this project). `orders.user_id` ↔ auth user UUID.

---

## Goal / definition of done
1. Clicking a customer on `/portal-customers` opens a **Customer Account page** (e.g. `/portal-customers/[id]` or `/customer/[id]`).
2. That page has an **editable details panel** (name, email, phone, default shipping address, country, company, notes) that saves to the **customer record** as the source of truth.
3. That page shows **all orders for that customer**, newest first, each linking to `/order/[orderId]`, with status + amount + date.
4. Editing customer details updates the master record only; **past orders' stored shipping addresses are untouched**; **new orders auto-fill** from the account.
5. Existing data is consolidated so each real person (by normalized email) is **one account** with **all** their orders attached.

---

## Data model
Prefer using the **existing** customer/user table rather than creating a new parallel one. Decide by inspecting the schema:

- **If a `customers`/`profiles` table already backs `/portal-customers`** (keyed by the same UUID as `orders.user_id`): make **that** the canonical Customer entity. Ensure it has editable columns: `full_name`, `email` (normalized, unique), `phone`, `default_shipping_address`, `country`, `company_id` (nullable FK → companies), `notes`, plus existing portal fields (auth/login/last_login). Add columns only if missing.
- **`orders.customer_id`**: standardize the FK from order → customer. If the real column is `user_id`, keep using it (don't rename gratuitously); just make sure it's **reliably populated for every order** (see migration). If you add a cleaner `customer_id`, backfill it from `user_id`/email and keep them in sync.
- **Order-level ship-to stays on the order.** Because editing is "master only," each order keeps its own `shipping_address` snapshot (what it actually shipped to). The customer's `default_shipping_address` is only the pre-fill/default for new orders and the "current address" shown on the account.

Keep `email` matching **case-insensitive and trimmed** everywhere (store a normalized form or use `lower(trim(email))` in the unique index and all lookups).

---

## Migration / backfill (one-off, reversible, dry-run first)
Goal: every order attached to exactly one customer account; duplicates merged by email; no data loss.

1. **Audit first (no writes).** Produce counts: orders with a valid `user_id`/customer link vs orders without; distinct normalized customer emails on orders; customer records with no matching orders; and **potential duplicates** (multiple customer records sharing one normalized email; or one email with conflicting names). Output this as a report the human reviews before step 3.
2. **Backfill missing links.** For orders with no `user_id`/`customer_id`, match to a customer by **normalized email**. If no customer exists for that email, **create** a customer record from the order's baked-in `customer_name`/`email`/`phone`/`shipping_address`/`country`. Log every create/link.
3. **Merge duplicates by normalized email.** Where multiple customer records share one email, pick a surviving record (prefer the portal/auth user that has logged in, else oldest), repoint all their orders to it, and copy over any non-empty details the survivor is missing. **Never** merge across **different** emails automatically — queue name-only collisions for human review.
4. **Seed each customer's default fields** from their **most recent** order's customer info (latest phone/address) if the customer record's fields are empty — so the account opens pre-populated.
5. Everything idempotent + wrapped so it can be re-run; keep a mapping table (old_id → surviving_id) so a bad merge can be reversed.

> Sanity check after migration: `Total Spent` and `Orders` counts on `/portal-customers` should still reconcile to the same account-level totals (allowing for merges reducing the customer count below 333). Print before/after totals.

---

## UI work

### A. Make `/portal-customers` rows open the account
Each row → link to the account page. Keep the existing search, stats, and "Invite Customer". Add a visible "View / Manage" affordance so it's obviously clickable.

### B. Customer Account page
Two regions:

**1. Details panel (editable, saves to the customer record):**
- Full name, email (with the case-insensitive uniqueness guard — warn if the new email already belongs to another account and offer to merge), phone, default shipping address, country, company (select from Companies), internal notes.
- Portal/login info shown read-only where appropriate (last login, portal active, invite/reset access — reuse existing portal controls).
- **Save = master record only.** Do **not** rewrite past orders. Show a small helper: "Updates the customer's default details. Existing orders keep the address they were placed with; new orders use these details."
- Optional (only if the owner later wants it): a per-save "also apply to this customer's active/open orders?" prompt — leave a clean extension point but default to off, matching decision #1.

**2. Orders list (read + link):**
- All of this customer's orders, newest first: order id (→ `/order/[id]`), date, status badge, design name, total amount, paid/remaining.
- Small header summary: lifetime orders count + total spent + last order date (reuse the same aggregation `/portal-customers` already computes).
- A **"New order for this customer"** action that pre-fills the customer's details into the new-order flow (nice-to-have; wire if low effort).

### C. Order page cross-link
On `/order/[id]`, make the **Customer Information** block show it's linked to an account: a "View customer account" link → the account page. Keep the order's own stored fields displayed (they're the historical snapshot); editing customer identity/contact should nudge the user toward the account page as the master, while order-specific things (this order's ship-to) remain editable on the order.

---

## Guardrails / don't-break list
- **Don't break the dual field names** (`patches_type`/`patchesType`, etc.) — keep writing whatever variants the current save path writes.
- **Don't disturb** the Square payment-form order creation, `system_auto_claim`, sales-agent assignment, or the **Meta Conversions API** block/events on orders.
- **Don't** auto-merge across different emails, and **don't** delete any customer record during merge — mark merged-away records inactive/redirected and keep the reverse-map.
- Email matching is **always** normalized (lower + trim).
- Keep everything behind the same auth/role checks as the rest of the admin portal.

## Acceptance criteria
- From `/portal-customers`, clicking a customer opens their account page.
- The account page edits save to the customer record; reloading shows the change; **a past order's stored shipping address is unchanged** after editing the account.
- The account page lists **all** of that customer's orders; each opens the correct `/order/[id]`.
- A customer who previously appeared as duplicates (same email) now appears once with all orders combined; per-account **Total Spent** reconciles.
- Creating a new order for an existing customer attaches to their account (via existing `user_id`/auto-claim path) and pre-fills their default details.
- No regression in order creation (Square webhook), auto-claim, sales-agent reassignment, or Meta CAPI.

## Test plan
1. Pick a customer with 2 orders (e.g. the "James Swain Jr / 2 orders / $410" case seen on `/portal-customers`): open account → confirm both orders listed and totals match.
2. Edit that customer's phone + default address → save → reopen → change persisted; open one of their **existing** orders → its shipping address is unchanged.
3. Create a test order for that customer → it appears on their account and pre-filled their details.
4. Run the migration dry-run report on a copy/staging; review duplicate/merge candidates; run for real; re-print before/after customer count + revenue totals to confirm reconciliation.
5. Regression: place a Square payment-form test order end-to-end → order created, `user_id` auto-claimed, Meta event fires, appears under the right account.
