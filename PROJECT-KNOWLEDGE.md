# Panda Patches CRM — Project Knowledge Base

**The single place where everything about this system lives:** what it is, how it's wired, the rules
that must not be broken, the bugs we've hit and why, and the status of every in-flight program.

> **How to use this file**
> - **New to the repo?** Read §1–§4.
> - **About to change something?** Check §5 (Rules) and §9 (Landmines) first — they're the things
>   that look safe and aren't.
> - **Debugging?** Read §7 (Bug Log) before theorising. Several bugs here were diagnosed wrong the
>   first time; the **Wrong turns** in each entry are recorded so nobody pays for them twice.
> - **Fixed a bug?** Add an entry to §7. Template at §10.
>
> Last consolidated: **2026-08-30**.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Order Lifecycle](#3-order-lifecycle)
4. [Data Model & Automations](#4-data-model--automations)
5. [Operating Rules — Do Not Break These](#5-operating-rules--do-not-break-these)
6. [Infrastructure, Domains & Deployment](#6-infrastructure-domains--deployment)
7. [Bug Log](#7-bug-log)
8. [Programs & Project Status](#8-programs--project-status)
9. [Known Landmines & Open Items](#9-known-landmines--open-items)
10. [Conventions](#10-conventions)

---

# 1. System Overview

The **staff-facing CRM and order-management dashboard** for Panda Patches, a custom manufacturing
business (patches, apparel, branded merchandise). It runs the full operational lifecycle: a lead
comes in, becomes a quote, converts to an order, moves through production and QA, ships, gets paid,
and feeds into financial reporting and loyalty tracking — all in one application with real-time
updates across the team.

React + TypeScript SPA backed by Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions),
deployed on Vercel. **A large share of the actual system isn't UI at all** — it's the automation
layer: Postgres triggers, Edge Functions, and cron jobs that fire emails, sync marketing pixels,
award loyalty tiers, and keep payment state consistent without anyone clicking a button. That layer
is documented in §4 because it's the part easiest to lose track of.

**Scope note:** the **customer-facing portal** (customer login, order tracking, file downloads) lives
on the marketing website (`www.pandapatches.com`), a separate repo. This repository is the internal
staff CRM, plus the shared serverless backend (Edge Functions — used by both this CRM and the
website), plus the public **agent-generated payment links** (`/pay/:token`).

## Feature Overview

**Orders & Quotes** — full lifecycle across 14 statuses; order detail with status timeline, full
change history (every field change logged with user + timestamp), communications log, internal notes,
and file attachments. Quotes with one-click convert-to-order (customer details, design specs, pricing
and attribution all carry over); quotes also convert automatically when a customer pays a quote's
Square link. Order assignment with an unassigned queue and per-agent workload. Bulk actions (bulk
cost entry, bulk close-to-delivered), server-side pagination/filtering, global search (covers
unconverted quotes too), quick-view drawer.

**Customers & Companies** — customer history (lifetime paid value, order/quote history,
communications, automatic duplicate detection by normalized email with a merge path); Companies
(parent accounts for B2B customers with multiple contacts, CC email support); portal-customer
management (invite / manage / re-invite — a separate identity from the CRM's own `customers` table);
loyalty tiers tracked per customer, driving discount codes, perks, and priority mockups.

**Reporting & Analytics (core strength)** — a Reports page with date-range filtering across 8+
modules:

| Module | What it answers |
|--------|-----------------|
| **Sales Report** | Gross vs. net revenue, refunds/cancellations, collected vs. pending, AOV, daily revenue trend, per-agent performance & commission (with payment-recovery breakdown), repeat-customer metrics |
| **Profit & Loss** | Revenue vs. cost vs. net profit, cost-breakdown donut (production/shipping/marketing), production cost by patch type, paginated Loss Alerts for orders sold below cost |
| **Income Statement** | Gross Revenue → less cancellations/refunds → Net Revenue → COGS → Gross Profit → operating expenses → Net Profit, with gross & net margins |
| **Cancellation & Refund** | Lost revenue and reason-category breakdown |
| **Product Mix** | Revenue, cost, margin by patch type and quantity band (1–50, 51–100, 101–200, 200+) |
| **Lead Source Distribution** | Lead volume by channel from quotes, grouped (Search, Social, Paid Ads, AI/LLM, Referral, …) |
| **Funnel & Attribution** | Quote→order conversion, agents bypassing the quote flow, Meta CAPI data quality (tracked / partial / untracked revenue) |
| **Customer & Form Feedback** | Satisfaction ratings (1–5★) from order notes, ease-of-use ratings from website quote forms |
| **Loyalty Stats** | Per-tier customer count, lifetime value, code redemption rate, reorder rate |
| **Lead Attribution** (CLADB5) | By-traffic and by-heard-about tables + traffic×heard-about matrix, weekly trend |

Charts via **Recharts**; every report supports **CSV export**.

**Financials & Cost Tracking** — bulk cost entry (production/shipping/marketing per order per month,
with live profit and margin); per-order P&L (`profit = order amount − (production + shipping +
marketing)`); monthly operating expenses feeding the Income Statement. **Payment integrity is
entirely server-side** — no client ever writes `amount_paid`/`payment_status` directly (§5.2).

**Attendance & Timesheets** — clock in/out with live shift tracking, daily/weekly/monthly hours,
overtime/undertime classification, CSV export (timezone-aware, 5 AM Pakistan-time shift boundary).
Admin tools to review and force-close stale sessions; a `pg_cron` job auto-closes sessions left open
beyond the max shift, with a client-side fallback.

**Messaging, Activity & Payments** — Inbox (internal and customer conversations, plus live Meta
Messenger/Instagram threads, real-time); system-wide activity log; agent-generated public payment
links (`/pay/:token`) backed by Square Checkout, capturing the same field set as the full Order Form
(CC email, PO#, company, border type, sample box, country, urgent + ship-by).

**Marketing & Attribution** — lead source on every order/quote; 5-country shipping/tax tracking
(USA, Australia, Canada, New Zealand, UK); Meta CAPI server-side Purchase & Lead/InitiateCheckout
with automatic reversal on refund/cancel; Google Ads hooks (currently a logged `SKIPPED` no-op, see
§8.7); UTM/Click-ID capture (fbclid/fbp, gclid/gbraid/wbraid, msclkid, ttclid) flowing from website
checkout and payment-form links into orders, with an attribution-recovery trigger that backfills
missing click data from the same customer's recent quotes / checkout attempts / payment-form tokens.

**Email Automation** — transactional email via **ZeptoMail (Zoho)** through the single `send-email`
Edge Function; every customer and internal milestone renders through one HTML template builder. Full
trigger table in §4.3.

**Users, Roles & Permissions (RBAC)** — 4 roles refined by 11 granular permission toggles:

| Role | Typical access |
|------|----------------|
| **ADMIN** | Everything — financials, reports, user management, settings, cost entry |
| **SALES_AGENT** | Orders, quotes, customers (own or all, by permission) |
| **PRODUCTION** | Production details, status changes, files — **no financials**, enforced at the database (§5.1) |
| **SHIPPING** | Shipping-stage fields (tracking, carrier, shipping docs) |

Granular permissions: `users_manage`, `orders_create`, `orders_view_all`, `orders_view_own_only`,
`orders_change_status`, `orders_edit_financials`, `orders_edit_production`, `orders_delete`,
`reports_view_financials`, `shipping_view`, `attendance_clock_only` (kiosk mode).

**Settings & Search** — business logo, company config, password change, Meta connection panel,
orphaned-file storage cleanup; global search across orders, customers and quotes.

## Application Routes

```
PUBLIC
  /login                          Staff login + password recovery
  /pay/:token                     Public payment form (agent-generated link)
  /pay/:token/thank-you           Payment confirmation

STAFF (authenticated)
  /                               Dashboard — KPIs, pipeline, recent orders, activity
  /orders                         All orders (filter, search, paginate, bulk actions)
  /new-order                      Create order
  /order/:orderNumber             Order detail (timeline, history, comms, files)
  /order/:orderNumber/edit        Edit order
  /quotes                         Quotes list
  /new-quote                      Create quote
  /quote/:quoteNumber             Quote detail (send, convert to order)
  /reports                        Reporting & analytics (8+ modules)
  /customers/:identifier          Customer history & lifetime value
  /search                         Global search results (orders + quotes)
  /activity                       System activity log
  /inbox  ·  /inbox/:id           Messaging (internal + Meta chat)
  /payment-forms                  Manage public payment links
  /patch-generator                Patch mockup generator
  /clock-in-out                   Attendance / timesheets
  /settings                       Business settings

ADMIN ONLY
  /bulk-cost-entry                Monthly cost entry & operating expenses
  /bulk-close                     Bulk-mark stale orders DELIVERED
  /user-management                Staff accounts, roles, permissions
  /performance-metrics            App performance monitoring (APM)
  /portal-customers               Customer portal account management
  /companies                      Company / parent-account profiles
```

---

# 2. Architecture

## Frontend
- **React 18** + **TypeScript 5** (strict) — fully typed
- **Vite 5** — fast HMR, code-split production builds (pages lazy-loaded)
- **Tailwind CSS 3** — custom brand design system + dark mode
- **TanStack Query 5** — server-state caching, background sync, pagination
- **React Router 6** — nested + protected routes (`ProtectedRoute`, `AdminRoute`, `HostnameRouter`)
- **React Hook Form 7** + **Zod**
- **Recharts** (analytics), **Framer Motion** (animation), **Lucide** (icons)
- **@react-pdf/renderer** (invoices/PDFs), **react-csv** (exports), **react-window** (virtualized lists)

## Backend — Supabase
- **PostgreSQL** with migrations, indexes, constraints — plus a substantial layer of
  triggers/functions/cron jobs applied directly against the live database that aren't all captured as
  migration files. **The live schema is the source of truth.**
- **Row-Level Security** on every table — staff see all, customers see only their own data
- **Supabase Auth** — email + password, invite links, password recovery
- **Supabase Storage** — private buckets with signed URLs for mockups, production files, attachments
  (order-attachment images are in a **public** bucket so they render inside transactional emails)
- **Supabase Realtime** — live order/attendance/messaging updates
- **25 Edge Functions (Deno)**
- **`pg_cron` + `pg_net`** — scheduled jobs calling Edge Functions directly from Postgres

## Supabase Edge Functions (25)
```
User admin        create-user · update-user · delete-user · get-users
Email             send-email (ZeptoMail, all templates)
Customer portal   invite-customer · mark-password-set
Orders/webhooks   super-handler (DB webhook: internal "new order" email
                  for checkout/payment-form orders) · notify-order-message
Meta CAPI/chat    send-meta-purchase · reverse-meta-purchase · send-meta-lead-event
                  send-meta-message · meta-webhook · meta-admin
Attribution       store-attribution · store-attribution-token
Payments          create-square-checkout · create-square-payment-link
                  square-payment-webhook
Google Ads        google-ads-conversions (DB webhook; currently a logged no-op)
Loyalty           validate-loyalty-code · loyalty-status · loyalty-email-cron
Reviews           review-invite-cron
```

⚠️ Only 4 of 25 (`square-payment-webhook`, `create-square-checkout`, `create-square-payment-link`,
`send-meta-lead-event`) use the Deno-native `jsr:@supabase/supabase-js@2` import. The rest still use
`esm.sh` — the exact import path that caused a ~2-day outage (§7.6). See §9.1.

## Vercel Serverless (`/api`)
- **`sentry-proxy.ts`** — tunnels Sentry events through a first-party domain (bypasses ad blockers),
  validating project ID/host before relaying.

## Infrastructure
```
Frontend (Vercel)  ──►  Supabase Auth (JWT)
                         │
                         ▼
                   PostgreSQL (RLS) ──► Edge Functions (Deno)
                          │  ▲                │
                    triggers  cron (pg_cron)  │
                          │                   │
            ┌─────────────────────────────────┼──────────────┐
            ▼            ▼                    ▼              ▼
        ZeptoMail    Meta CAPI            Square          Sentry
        (email)      (ads + chat)         (payments)      (errors)
```

---

# 3. Order Lifecycle

`OrderStatus` (`src/types/index.ts`) — the database column `orders.status` is plain `text`, **not** a
Postgres enum, so ordering/validity is enforced at the application layer plus a handful of guard
triggers.

| Status | What it means / what moves an order into it |
|---|---|
| `PENDING_PAYMENT` | Held "wait for payment" order (Add Order / Re-order with a deposit not yet collected). Excluded from the production queue and all creation emails. Released to `NEW_ORDER` automatically by `apply_order_payment()` the moment **any** payment lands via Square. |
| `NEW_ORDER` | Default at creation for every normal flow; also the release target from `PENDING_PAYMENT`. A trigger forces any inserted status of `''`/null/`PAID`/`CONFIRMED` to `NEW_ORDER`. |
| `REVISION_REQUESTED` | Agent sets this after the customer asks for mockup changes. 3+ revision loops raise an admin notification. |
| `AWAITING_CUSTOMER_APPROVAL` | Mockup sent for approval (only reachable from `NEW_ORDER`/`REVISION_REQUESTED`). Fires Meta CAPI **Lead**. |
| `APPROVED` | Customer approves the mockup. Treated identically to `IN_PRODUCTION` for email/CAPI. |
| `IN_PRODUCTION` | Production begins. Fires Meta CAPI **InitiateCheckout**. |
| `QUALITY_ASSURANCE` | Pre-ship QA check. |
| `REMAKE` | Redo (quality/handling/lost-in-transit/force majeure — customer wording adapts to the reason). Clears any production-complete stamp. |
| `COMPLETED` | Terminal-ish general completion. |
| `SHIPPED` | Tracking number/carrier captured — see the tracking-number note below. |
| `CANCELLED` | Terminal. Triggers Meta CAPI Purchase **reversal** if a Purchase was sent. |
| `DELIVERED` | Stamps `delivered_at` on first transition (or via bulk-close, which can mark it estimated). Starts the review-invite clock. |
| `REFUNDED` | Terminal, same CAPI-reversal treatment as `CANCELLED`. |
| `FEEDBACK` | Feedback-request stage (counted alongside `DELIVERED` as review-eligible). |

DB-level guard triggers back these rules so they hold even if a bug or direct SQL edit bypasses the
UI: once `payment_status='paid'` it can never be silently un-set except by moving to
`CANCELLED`/`REFUNDED`; and a production-only/non-financial user's UPDATE has money fields stripped
and status changes blocked **server-side**, not just hidden in the UI.

### ⚠️ A note on tracking numbers
The `SHIPPED` email only renders the Tracking Information box when `shippingTrackingNumber` is present
**on the same save that sets status to `SHIPPED`**. If tracking is added in a **later, separate
edit**, no email fires again — the status doesn't change a second time and nothing else re-notifies
the customer. **Operationally: enter tracking before or at the same time as marking shipped, never
after.**

---

# 4. Data Model & Automations

The live schema is considerably larger than `supabase/migrations/` (39 tracked files) — many tables,
columns and functions were added directly against the live database. Below reflects the **live**
schema.

## 4.1 Tables

### Orders, quotes & payments
| Table | Purpose | Notable columns |
|---|---|---|
| `orders` | Master order record | `status` (free text), `payment_status`/`paid_at`/`balance_due`, `is_web_checkout`, `is_reorder`, `deleted_at` (soft delete), `attribution` (jsonb) + `attribution_quality` (generated: tracked/partial/untracked), `capi_purchase_sent*` + `capi_lead_events`, `loyalty_code_used`/`loyalty_discount_percent`, `priority_mockup`, `converted_from_quote_id`/`_number`/`had_prior_quote_request`, `legacy_customer_ref`, `ship_city`/`ship_state`/`ship_postal` (structured geo, separate from free-text `shipping_address`), `organization`, `order_channel`/`agency_name`/`end_client_confidential`, `delivered_at_estimated`, `ship_by_date` |
| `quotes` | Pre-order estimate / lead capture | `converted_at`/`converted_order_id`, `is_duplicate` (auto-flagged if same email quoted within 48h), `meta_psid`/`meta_ig_id`/`meta_channel`/`meta_ad_id`/`meta_ctwa_clid` |
| `payment_form_tokens` | Staging for agent-generated payment links | `token` (the Square `reference_id`), `deposit_amount`/`is_deposit`, `expires_at` (7 days), `used_at`/`order_id`/`order_number`, `customer_attachment_urls`, `shipping_address` |
| `square_pending_orders` | Staging for website "Buy Now" checkout | `token`, `order_data` (jsonb cart snapshot), `consumed_at` (atomic claim — also raced against a separate non-CRM process watching the same table) |
| `square_processed_payments` | Payment-level idempotency ledger | `payment_id` (unique) — the real guard against duplicate order creation |
| `square_webhook_events` | Event-level dedup | `event_id`, `event_type` — catches literal webhook retries |
| `order_history` | Audit trail of order field changes | Written by trigger on plain column changes, and manually by RPCs/edge functions for events that aren't (creation, deletion, payment corrections, manual payments) |
| `order_communications` | Per-order email send log | `template_id`, `visibility` — backs the Email Logs UI and resend-failed-email |
| `order_notes` | Internal sales notes / quality feedback / complaints | Optional 1–5★ rating |
| `checkout_attempts` | Abandoned-cart capture from the website's checkout | `email_sent_at`/`email_2_sent_at` (the sequence lives in the website's codebase, not here) |

### Customers & staff
| Table | Purpose |
|---|---|
| `customers` | CRM's customer master, deduped by normalized email — `lifetime_paid_value`, `loyalty_tier`, tier-achieved timestamps, `merged_into_id` |
| `customer_profiles` | Customer **portal** identity (distinct from `customers`; 1:1 with the portal's `auth.users`) |
| `user_profiles` | Internal staff — `role` + granular `permissions` jsonb (this jsonb is what actually enforces "production can't touch money") |
| `customer_flags` | Ad-hoc `is_premium` per customer, admin-set |
| `customer_privacy_optouts` | Erasure/suppression registry (§5.4) |
| `activity_notifications` | In-app bell notifications to staff |
| `customer_notifications` | Customer-portal equivalent, keyed by customer email |

### Loyalty · Reviews · Meta chat · Google Ads · Other
| Table | Purpose |
|---|---|
| `loyalty_codes` | One row per awarded code — tier, percent, `single_use` (Bronze), `expires_at` (Bronze 90d), `status`, send/redemption timestamps |
| `loyalty_rush_upgrades` | Gold's one-free-rush-upgrade-per-quarter ledger |
| `loyalty_admin_audit` | Admin override log (grant/revoke/reissue) — `reason` mandatory |
| `review_invitations` | One row per order — invite/reminder timestamps, status |
| `conversations` | Messenger/Instagram thread state — assignee, unread count, `promoted_quote_id`/`promoted_to_order_id` |
| `meta_messages` | Individual messages, deduped on Meta's message id, with the 24-hour-window tag |
| `google_ads_upload_log` + `google_ads_data_manager_export*` | See §8.7 |
| `monthly_costs`, `attendance_sessions`/`attendance_summary`, `performance_metrics`, `form_feedback` | Operating expenses, clock in/out, APM, quote-form UX ratings |

**Unused / suspect:** `orders.paypal_order_id`/`paypal_capture_id` + a `paypal_pending_orders` table
(no PayPal edge function exists here — confirm with the team before treating as active), and an
`email_templates` registry table (real templates are hardcoded in `send-email`'s TypeScript).

## 4.2 The 5 order-creation paths

Every order comes from one of these, and each sets `sales_agent`/`attribution` differently — which
matters because several automations key off exactly those two fields:

1. **Staff-created (CRM UI)** — `sales_agent` = logged-in staff email. Immediate confirmation +
   internal emails unless the agent picks the held `PENDING_PAYMENT` state. Synchronously provisions
   the customer's portal account so the invite link rides along in the same confirmation email.
2. **Payment Form (agent pay link)** — `sales_agent` = the agent who built the link;
   `attribution.source = 'square_payment_form'`. Created already paid, never held.
3. **Website "Buy Now" checkout** — `sales_agent = 'WEB_CHECKOUT'`; `attribution.source =
   'square_checkout'`. Portal provisioning intentionally NOT done here — the website's own account
   flow owns it.
4. **Existing-order balance payment** — doesn't create an order; applies a payment to one that
   exists (including releasing a held `PENDING_PAYMENT` order).
5. **Quote paid via its own Square link** — `sales_agent` = whatever the quote had (often
   `WEBSITE_BOT`). Created already paid; the source quote is marked converted, never deleted.

All 5 share one Edge Function, `square-payment-webhook` — which is why its idempotency has to work at
two levels simultaneously (§4.5).

## 4.3 Every email template & what fires it

| Template | Fired by | To | Guard |
|---|---|---|---|
| `CUSTOMER_NEW_ORDER` | Staff-created order (path 1) | customer | fires once, at creation |
| `INTERNAL_NEW_ORDER` | Three mutually-exclusive triggers (see below) | production team | `production_notified_at` claim; PVC → nothing sent |
| `CUSTOMER_MOCKUP_READY` | Status → `AWAITING_CUSTOMER_APPROVAL` | customer | — |
| `CUSTOMER_REVISION_IN_PROGRESS` / `PRODUCTION_TEAM_REVISION` | Status → `REVISION_REQUESTED` | customer / production | PVC suppresses internal copy |
| `CUSTOMER_PRODUCTION_STARTED` / `INTERNAL_START_PRODUCTION` | Status → `IN_PRODUCTION`/`APPROVED` | customer / production | PVC suppresses internal copy |
| `QUALITY_ASSURANCE` | Status → `QUALITY_ASSURANCE` | customer (template id sounds internal, but the code sends it to the customer — worth confirming with the team) | — |
| `CUSTOMER_SHIPPED` | Status → `SHIPPED` | customer | see tracking-number note (§3) |
| `CUSTOMER_DELIVERED` | Status → `DELIVERED` | customer | — |
| `CUSTOMER_FEEDBACK_REQUEST` | Status → `FEEDBACK` | customer | — |
| `CUSTOMER_REFUND_ISSUED` | Status → `REFUNDED` | customer | — |
| `CUSTOMER_REMAKE` / `INTERNAL_REMAKE` | Status → `REMAKE` | customer / production + sales agent | PVC suppresses internal copy |
| `INTERNAL_PRODUCTION_COMPLETE` | Production marks production-complete | `hello@pandapatches.com` (fixed; **not** PVC-gated) | — |
| `CUSTOMER_PAYMENT_CONFIRMATION` | Any Square payment landing (all 5 paths + balance payments) | customer | **two** independent one-shot guards — "confirmed" and "paid in full" (the PAID invoice PDF only attaches once the second fires); consolidated into one email even when both fire at once |
| `INTERNAL_PAYMENT_NOTIFICATION` | Manual "record payment" only | `lance@pandapatches.com` fixed | — |
| `WEBSITE_AUTH_ORDER_ACCOUNT` | First portal-account provisioning | customer | `invite_sent_at` per-order claim |
| `CUSTOMER_RETURNING_LOGIN` / `CUSTOMER_PASSWORD_RESET` | Returning login / password reset | customer | — |
| `AGENT_NEW_CUSTOMER_MESSAGE` / `CUSTOMER_NEW_AGENT_MESSAGE` | Order message thread reply | agent+admins / customer | — |
| `CUSTOMER_REVIEW_INVITE` / `CUSTOMER_REVIEW_REMINDER` | Daily review-invite cron | customer | claimed via `review_invitations`; reminder once, 5+ days after invite; skips `customer_privacy_optouts` |
| `LOYALTY_BRONZE_AWARDED` / `LOYALTY_SILVER_AWARDED` | Daily loyalty cron, on tier-up | customer | claimed on the `loyalty_codes` row before send |
| `LOYALTY_GOLD_DRAFT` | Daily loyalty cron, on Gold tier-up | drafted to Imran for a personal one-click send — **never** auto-sent | same claim |
| `LOYALTY_BRONZE_EXPIRY` | Daily loyalty cron | customer | reminder claim + 14-day global cap |
| `LOYALTY_NEAR_THRESHOLD` | Daily loyalty cron | customer | quarterly + 14-day caps; skipped if a `REMAKE` opened in the last 30 days |

**The `INTERNAL_NEW_ORDER` duplicate, and why it's now three mutually-exclusive paths:** as of
2026-08-28 this template fires from exactly three places, gated so only one ever fires per order —
(a) the CRM-UI creation path sends it directly; (b) a **database webhook** (fires on every `orders`
insert/update, not called from app code) sends it for website-checkout and payment-form orders once
the order is complete enough for production (patch type + backing + size + ≥1 image), claimed
atomically so concurrent retries can't double-send; (c) the quote-payment webhook path sends it
directly for quote-paid orders, which never match the DB webhook's gating. A same-day fix removed a
genuine duplicate (PP-11361 got two internal emails) caused by a redundant send inside the webhook
for cases the DB webhook already covered.

## 4.4 Cron jobs

| Job | Schedule | What it does |
|---|---|---|
| `review-invite-cron` | Daily, 15:00 UTC | Personal review-invite + single reminder |
| `loyalty-email-cron` | Daily, 16:00 UTC | All loyalty tier/expiry/nudge emails |
| `colour-match-cron` | **Hourly, :07** | Colour-match chase: 24h customer reminder, 48h agent follow-up. Never writes `matched_yarn` — see §5.8 |
| Nightly loyalty reconciliation | Daily, 07:00 UTC | Recomputes every active customer's tier from scratch as a backstop to the real-time trigger |
| ~~Stale attendance auto-close~~ | — | ⚠️ **No such cron job exists.** Verified against `cron.job` 2026-08-31: only 4 jobs were scheduled then (5 since `colour-match-chase-hourly`, jobid 6, 2026-09-04) (review-invite, recompute_all_loyalty, loyalty-email-cron, a one-off web_vitals truncate). `FUTURE_UPGRADE_auto_clockout_cron.sql` was never applied, so the client-side call from [ClockInOutPage.tsx:200](src/pages/ClockInOutPage.tsx#L200) is the **only** mechanism today. |

### Adding a cron job — the shared secret lives in TWO places

Every scheduled edge function here follows one pattern, and it is easy to half-finish:

1. **Vault** (`vault.create_secret(value, 'name', 'desc')`) — pg_cron reads it from
   `vault.decrypted_secrets` to build the `x-cron-secret` header.
2. **Edge Function Secrets** (Supabase dashboard → Edge Functions → Secrets) — the function
   reads it from `Deno.env` to compare against that header.

They must hold the **same value**. Set only the Vault half and every run is a clean 401.
Set only the dashboard half and the function throws "not configured". Neither failure is
loud — the job just quietly does nothing, so check `cron.job_run_details` after wiring one up.

The function itself deploys with `verify_jwt: false`; the shared secret is the auth, not the
JWT (the cron sends a service-role JWT too, but the secret is what the handler checks).

## 4.5 Idempotency is layered, not a single point

Square can and does deliver multiple `payment.updated` events per payment, and a database webhook can
fire multiple times per row update. Nothing relies on a single guard:

1. **Event-id dedup** (`square_webhook_events`) — catches a literal repeated webhook delivery.
2. **Payment-id claim** (`square_processed_payments`) — the real guard against creating the same
   order twice across Square's several deliveries per payment.
3. **Per-flow claims** — a payment-form token's `used_at`, a pending-checkout row's `consumed_at`,
   and one-shot timestamp columns on `orders` (`production_notified_at`,
   `customer_confirmation_sent_at`, `paid_invoice_sent_at`, `invite_sent_at`) — each claimed with an
   atomic conditional UPDATE before anything is sent, so a concurrent retry always loses the race and
   skips rather than double-sending.

## 4.6 Meta CAPI & marketing automation

- **Purchase** — fires once per order on the **first** payment (deposit or full), sending the **full
  order amount** regardless of what was collected (§5.3). Reversed automatically (negative-value
  correction, same event id) on cancel/refund.
- **Lead** — fires when a mockup is sent for approval. **InitiateCheckout** — fires when production
  starts. Both correctly omit `value`/`currency` when there's no real positive order amount (fixed
  2026-08-28; they used to send a malformed `value: 0`, which Meta counts as a genuine zero-value
  event and quietly drags down reported AOV).
- **Meta chat webhook** — receives Messenger/Instagram DMs, fires a Lead for a brand-new
  conversation, raises an in-app notification for the assigned agent (or all admins if unassigned).

## 4.7 PVC is the one patch type with no internal emails

Since a 2026-07 vendor change, `PVC` orders send **zero** internal notification emails at any stage
(new order, revision, production start, remake). Customer-facing emails are unaffected. Intentional —
PVC is routed to a vendor manually — but worth knowing if a "missing" internal email is ever reported
for a PVC order.

---

# 5. Operating Rules — Do Not Break These

These are the invariants. Each has a real incident behind it.

## 5.1 Production must never see sales or payment information

The production/internal team must NOT see order amounts, amount paid, deposits, remaining balance,
profit, costs, lead source, or **any** financial figure. Their view is limited to what's needed to
make the product: design name, patch type, backing, size, quantity, instructions, attachments,
status.

**Why:** roles are separated — production makes patches, sales/admin handle money. Leaking payment
detail to production is a privacy/role-boundary violation the owner explicitly does not want.

**Enforced in three independent places:** a database trigger strips every money column from any
update by a production-only/non-financial user and blocks them from changing status at all; the
order-detail financials section is separately gated in the UI on an admin/financial-viewer
permission; and the "production complete" internal email is built from a hand-picked, money-free
payload rather than reusing the general email-data builder, so a future field added to that builder
can't leak a dollar figure.

**⚠️ Watch for indirect leaks.** The checkout deposit note `[DEPOSIT - $X paid; remaining balance to
collect separately]` is prepended into the `instructions` field in `square-payment-webhook`, so it
surfaces in the production email even though `order_amount`/`amount_paid` are separate columns. Keep
payment context in sales/admin-only fields, never in shared fields like `instructions`.

## 5.2 `amount_paid` / `payment_status` are payment-flow-owned

Owned **exclusively** by the Square webhook (`square-payment-webhook` FLOW B) and the manual-payment
RPC. A general order edit must NEVER write them.

**Why:** the webhook does NOT bump `orders.updated_at` when recording a payment, so
`updateOrderDetails`'s optimistic lock (keyed on `updated_at`) can't detect a payment that landed
while an edit form was open. The form loads a stale `amount_paid` and clobbers it on save — this
silently lost PP-11151's $160 balance (§7.8).

**How it's enforced:**
- `updateOrderDetails` (`src/services/orderService.ts`) strips
  `amountPaid`/`amount_paid`/`paymentStatus`/`payment_status` from its payload — **keep it that way**.
- `apply_order_payment(p_order_id, p_amount)` does a row-locked (`FOR UPDATE`) atomic increment, sets
  `payment_status`/`paid_at`, releases held `PENDING_PAYMENT` orders, and bumps `updated_at`.
- `record_manual_payment` (over-payment guard, audited) and `correct_order_payment(p_order_id,
  p_new_amount_paid, p_reason)` (SECURITY DEFINER, row-locked, overwrite to an exact value, reason
  required, writes a `payment_correction` audit row) are the only other writers. `correct_order_payment`
  **blocks lowering a confirmed Square-webhook payment** — refund in Square instead. Gate is
  `is_admin() OR has_permission('orders_edit_financials')` (all 5 sales agents have it, so agents can
  fix their own mistakes).

**Current UX (2026-08-11, supersedes the earlier hard-lock):** OrderForm's Amount Paid is an editable
number input for `canEditFinancials && !isNewOrder`. `EditOrderPage`'s update mutation calls
`updateOrderDetails` (still stripping the field) and then, only if `amountPaid` differs from
`initialOrder.amountPaid` by >0.005, calls the `correct_order_payment` RPC. So the field is typeable
but the write still goes through the guarded RPC — fires only on change (no clobber of a background
payment), blocks lowering a confirmed Square payment, and is audited. The owner accepted this
tradeoff ("1 clobber in 4 months is acceptable") to get the natural edit UX back.

**Status conventions:** lowercase `'paid'`/`'pending'` per `guard_payment_status_regression`. The
orphan `update_order_payment_status` function uses `'complete'` and is **not** attached to orders —
ignore it. The guard blocks downgrading an already paid+`paid_at` order, so correcting a fully-paid
order downward leaves `payment_status='paid'`.

## 5.3 Deposit fires a full-order-value Meta Purchase — confirmed, keep as-is

`fire_capi_purchase_on_paid()` fires on FIRST payment (`OLD.amount_paid = 0 → NEW.amount_paid > 0`),
deposit or full. `send-meta-purchase` sends `value: order.order_amount` (the full total, not what was
paid), stamping `payment_status_at_fire: "deposit" | "fully_paid"` in `custom_data`.

**Why:** standard practice for 10–30 day custom-production orders where a deposit is a strong
purchase-intent signal. Verified independently: 32 orders in a trailing 90 days fired CAPI while
`amount_paid < order_amount`. Raised to and confirmed by ownership — not an oversight.

**How to apply:** a Sales campaign optimizing on Purchase value learns from these full-value deposit
fires. If ROAS looks off after such a campaign launches, this is the first thing to revisit. Options
discussed: "fire only on full payment" (simpler, delays/loses attribution for slow orders) or "split
into deposit + balance events" (most accurate, doubles event volume, needs a second event_id scheme
coordinated with the website). **Don't silently change this — it's a CEO-level call, already made.**

**🚨 Do NOT change the `send-meta-purchase` event_id (`order_${order.id}_purchase`).** It's the
canonical Meta Purchase dedup key shared across **three** senders: this CRM's `send-meta-purchase`,
the website's own Square-webhook CAPI call, and the browser pixel on the website's `/success` page.
The website side was changed 2026-08-27 to match after 16 web-checkout orders were found
double-firing. **If this scheme ever changes here it must ship in the same deploy as the matching
website change**, or double-counting returns immediately.

## 5.4 Privacy opt-outs must be honoured by every export

`public.customer_privacy_optouts` (created 2026-07-18) is the erasure/opt-out registry: `email` (NOT
NULL, CHECK-enforced lowercase/trimmed), `customer_id` (nullable FK, ON DELETE SET NULL),
`opted_out_at`, `reason`. RLS enabled with **no policies** — deny-by-default is intentional (the
security advisor INFO finding about it is expected); anon/authenticated revoked; writes happen via the
SQL editor or service role.

**Why:** Customer Match policy requires honoring deletion/erasure requests; before this table the
guardrail was unenforceable.

**How to apply:** support inserts a row (email required, lowercase) on an erasure request —
`google_ads_data_manager_export_customers` excludes matches on email or customer_id automatically
(smoke-tested). **Any FUTURE audience/export view must also LEFT-JOIN-exclude this table.** No UI
exists yet; if one is built, keep the lowercase CHECK in mind. ⚠️ Currently checked by the
**review-invite cron only** — the loyalty cron does **not** consult it, worth addressing if global
marketing suppression is expected to cover loyalty emails.

## 5.5 Any lead-source value the resolver can emit must exist in `LEAD_SOURCE_OPTIONS`

`LEAD_SOURCE_OPTIONS` (`constants/options.ts`) once listed `Facebook`/`Google` but not the Ad
variants (`Facebook Ad`, `Google Ad`, `Bing Ad`, `TikTok Ad`) that the webhook/`detectLeadSource`
auto-assign from click IDs. An ad-attributed order opened in the edit form found no matching
`<option>`, rendered a **blank** Lead Source, and **silently overwrote the real source with
blank/Direct on any save** — which is what kept reverting attribution backfills. Fixed by adding the
4 Ad variants plus an amber "🔒 auto-detected from the customer's ad click — please don't change
this" warning shown whenever `attribution` carries fbc/fbclid/gclid/gbraid/wbraid/msclkid/ttclid.

## 5.6 Bulk-close and review emails interact — keep the 30-day default

`review-invite-cron` emails a Trustpilot request for any order with status DELIVERED/FEEDBACK whose
`delivered_at` is **2–5 days old**. Bulk-closing a backlog with a **recent** delivery date drops every
closed order into that window ~2 days later and mass-emails customers about orders delivered months
ago. The bulk-close form defaults to **30 days ago** and warns if a date inside the last 6 days is
picked — **keep it that way**.

Everything else in the close path is email-safe: the customer "Delivered" email comes from the
frontend service (the RPC bypasses it), `super-handler` only sends the internal production email
(guarded by `production_notified_at`), CAPI Purchase needs an `amount_paid` 0→>0 transition, and CAPI
reversal only fires on CANCELLED/REFUNDED.

## 5.7 The website shares the `orders` table — CRM hygiene is a public-accuracy issue

The marketing website (separate repo) reads the **same** Supabase `orders` table and publishes public
aggregates (e.g. `/locations` publishes real delivered-order counts by US state = status
DELIVERED+FEEDBACK). Coordinate schema/vocab changes.

Columns the website relies on:
- `organization` — the company / end client the order is **for**. Query THIS to find brand orders
  (e.g. Microsoft), **not** `customer_name`. Empty on historical orders (no backfill).
- `order_channel` (`'Direct'|'Agency'`), `agency_name`, `end_client_confidential` — white-label
  provenance; when `end_client_confidential=true` the end client must NOT be named publicly.
- `delivered_at_estimated` — **true = the delivery date is an estimate** (set by bulk-close). The
  website should compute median delivery time from `delivered_at_estimated=false` rows only.

**Chronic order-status backlog:** agents don't close orders after shipping. ~306 SHIPPED/IN_PRODUCTION
were 45d+ old (47% of the book), understating public delivered counts by ~half. Tools built:
admin-only `bulk_close_orders(p_order_ids bigint[], p_delivered_at date, p_estimated bool)` RPC
(SECURITY DEFINER, `is_admin` only) + `/bulk-close` page + a `StaleOrdersAlert` dashboard banner
(SHIPPED/IN_PRODUCTION 30d+). `set_order_delivered_at` only sets `delivered_at` when NULL, so an
explicit bulk date sticks. A normal single close leaves `delivered_at_estimated=false`.

⚠️ The 2026-08-11 backing backfill bumped `updated_at` on 982 orders, so **`updated_at` is not a
reliable staleness signal** — bulk-close filters on `created_at` age.

---

# 6. Infrastructure, Domains & Deployment

## 6.1 Domain map

- **portal.pandapatches.com** — the **staff CRM** (this repo's Vercel deployment; what the team
  uses). This repo also builds the one public `/pay/:token` payment-form page.
- **login.pandapatches.com** — serves the public `/pay/:token` payment form. ⚠️ It does **not**
  resolve to any live *customer-portal* deployment (confirmed by the website dev 2026-08-27 — absent
  from that repo's `vercel.json`/canonical-host config). `PORTAL_HOSTNAME` in `src/config/portal.ts`
  still points here; treat as stale/aspirational for portal purposes.
- **www.pandapatches.com** — BOTH the marketing site AND the live **customer portal**
  (`/account/orders/:ref`, `/customer/order/:ref` redirect shim) — same Next.js/Sanity deployment
  (`d:/Projects/panda-patches-ecommerce`). This repo's customer-facing email links (`orderService.ts`,
  `notify-order-message`) point here, not at `login.`.
- **api.pandapatches.com** — the digitize/mockup VPS service (patch-generator).

## 6.2 Database access model

**The CRM connects to Supabase EXCLUSIVELY via the REST API** — `createClient(url, anon/serviceKey)`.
No `DATABASE_URL` / direct `pg` connection anywhere in the repo.

**Implication:** DB password resets and network restrictions do **not** affect the app, team,
customers, or website. Only direct DB clients (psql/DBeaver) are affected.

**Network lockdown (2026-08-02/03):** an external IPv4 brute-force (users `guest`/`postgres` from
`186.236.254.56` + `64.89.163.134`) hit the Postgres port — **all rejected**, never breached (the 806
"Postgres errors" in the dashboard were these rejections). Response: **Network Restrictions enabled**
(Database → Settings → Network restrictions), locking direct DB + pooler access to the home IP
`119.73.96.17/32` (DYNAMIC — Karachi/Trans World, will change; harmless since the app uses REST and
the dashboard SQL editor is exempt as a Supabase service). Password **not** rotated (all attempts
failed = not compromised).

**⚠️ Future gotcha:** if anyone adds a **direct DB connection** (a `DATABASE_URL`/pooler string from
Vercel, a BI tool, `supabase db push` from CI) it will be **BLOCKED** unless its IP is allowlisted.
Migrations are currently run via the dashboard SQL editor (exempt), so this hasn't bitten anything.

**Postgres upgrades & collation warnings:** upgraded to 17.6.1.155 in Aug 2026. That upgrade caused
"collation version mismatch" WARNINGS (ICU 153.120→153.121, trivial patch bump). Cleared the
`postgres` DB with `ALTER DATABASE postgres REFRESH COLLATION VERSION`. **`template1` warnings PERSIST
and are EXPECTED** — you can't `ALTER template1` (42501: not owner on managed Supabase); it's an empty
system DB, emitted by autovacuum, cosmetic, no data risk. The Supabase UI mislabels them "error" but
severity is WARNING (01000). **Ignore — don't re-investigate.**

## 6.3 `vercel.json` — never reintroduce legacy `routes`

⚠️ Fixed 2026-08-20. The config once had BOTH legacy `routes` and modern `rewrites`/`headers`. Vercel
forbids mixing: **with `routes` present the modern properties are silently ignored**, so the
`Cache-Control` headers never applied. `index.html` (which references content-hashed entry chunks
`/assets/index-<hash>.js`) then got cached, and after a deploy it pointed at files that no longer
existed → **no JS ran at all → blank navy screen**, which `ChunkErrorBoundary` CANNOT catch because it
never mounts. Showed up on iOS first (aggressive caching).

Legacy `routes` also has no filesystem handler, so the `/(.*)` catch-all swallowed real static files —
that's why `/service-worker.js` returned index.html and threw "unsupported MIME type (text/html)".
Now `rewrites` + `headers` only.

Also: **the service worker must never cache/serve the HTML document** (its fetch handler returns early
for `mode === 'navigate'`), because fixing the routing finally lets the SW register, and its
network-first cache fallback would otherwise serve a stale `index.html` on a flaky mobile connection
and recreate the same blank screen. Cache name bumped to v3 to purge any stale v2 document. The SW
also skips all cross-origin requests, so Supabase calls are never proxied through it.

## 6.4 Environment variables

`.env` is **gitignored**. Frontend `VITE_` values are public by design (the anon key is safe — data is
protected by RLS). Server-side secrets live only in the Vercel and Supabase dashboards.

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Frontend / Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend / Vercel | Public client auth key (RLS-protected) |
| `VITE_CRM_BASE_URL` | Frontend / Vercel | App base URL (links, redirects) |
| `SENTRY_PROJECT_ID`, `SENTRY_HOST` | Vercel | Validate/relay events in `api/sentry-proxy.ts` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | Admin operations inside Edge Functions |
| `ZEPTOMAIL_API_KEY` | Supabase secret | Transactional email delivery |
| `BILLING_FROM_EMAIL` | Supabase secret | From-address for the PAID-invoice email once `billing@` is verified (defaults to `hello@`) |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Supabase secrets | Square Checkout + webhook HMAC |
| `META_ACCESS_TOKEN`, `META_TEST_EVENT_CODE` | Supabase secrets | Meta CAPI sends |
| `LOYALTY_VALIDATE_SECRET`, `LOYALTY_CRON_SECRET` | Supabase secrets | Loyalty server-to-server + cron auth |
| Cron secret header | Supabase secret | Authenticates `review-invite-cron`/`loyalty-email-cron` |

## 6.5 Local development

Requires **Node.js 20.x** (pinned in `package.json` → `engines`) and a Supabase project.

```bash
npm install
cat > .env <<'EOF'
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_CRM_BASE_URL=http://localhost:5173/
EOF
npm run dev      # http://localhost:5173
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm test` | Vitest unit suite once |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc --noEmit` — must be clean (0 errors) |

## 6.6 Deployment

- **Frontend** auto-deploys to **Vercel** on every push to `main`. SPA routing, asset caching and the
  Sentry proxy rewrite are in `vercel.json`. Set the Vercel project's Node.js version to **20.x**.
- **Backend** on **Supabase Cloud** — `supabase db push` (migrations) and `supabase functions deploy`.
  In practice schema and edge-function changes are often applied via the Supabase dashboard rather
  than round-tripped through a local migration file — **when that happens, back-fill a migration file
  afterward** so `supabase/migrations/` doesn't drift further.

**⚠️ Supabase MCP is unauthorized.** The MCP server connects (shows in `/mcp` as connected) but every
tool call returns *"Unauthorized. Please provide a valid access token via --access-token or
SUPABASE_ACCESS_TOKEN."* Connected ≠ authorized: the stdio handshake succeeds but the server has no
valid personal access token (`sbp_...`). **Don't retry blindly** — check `claude mcp get supabase`,
add `--access-token sbp_...` or `SUPABASE_ACCESS_TOKEN=sbp_...`, then fully restart (the token is read
at server startup). Until then, fall back to the SQL editor + `supabase functions deploy`.

## 6.7 Testing & quality gates

- **Runner:** Vitest (jsdom). **104 tests across 8 files**, all passing.
- **High-value suites** cover business-critical pure logic:
  - `src/utils/leadSource.test.ts` — attribution precedence (ad → click-id → UTM → referrer →
    Direct), the "Checkout is a channel, not a source" invariant, `/ Checkout` display.
  - `src/utils/patchVocab.test.ts` — order-form dropdown normalization (PVC / iron-on / aliases).
  - `src/utils/fetchAllPaged.test.ts` — pagination never silently truncates past PostgREST's 1000-row
    cap (the bug class that once hid older quotes from the Quotes page — fixed 2026-08-28 by paging in
    batches instead of a single oversized `.limit()`, which PostgREST silently caps regardless).
  - `src/utils/parseUsAddress.test.ts` — US address parsing (mirrored inside the webhook — keep in sync).
- **Type safety:** `tsc --noEmit` clean (0 errors), enforced as a gate.
- **CI:** `.github/workflows/ci.yml` runs `npm test` (blocking) + `npm run typecheck` (informational)
  on every push / PR to `main`.
- **Remediation tracker:** `AUDIT_REMEDIATION.md`.

## 6.8 Security summary

- **RLS** on every table — access enforced at the database layer
- **Granular per-user permissions** enforced in both app and database (§5.1)
- **Admin-gated user management** — `create-user`/`update-user`/`get-users`/`delete-user` verify the
  caller is an admin server-side (JWT → role check) before any privileged action
- **Server-side payment integrity** (§5.2) — clients never write `amount_paid`/`payment_status`
- **Invite-link / recovery-link auth** — no plaintext passwords in email
- **Idempotent webhooks** (§4.5, HMAC-verified) and CAPI reversal on refunds
- **Sentry proxy tunnel** keeps error reporting first-party and blocker-resilient
- **React** auto-escaping; thorough HTML-escaping in transactional email; inputs normalized (empty →
  `NULL`) before writes
- **Storage note:** order-attachment images live in a **public** bucket so they render inside emails;
  non-public artifacts should continue to use signed URLs. See `AUDIT_REMEDIATION.md` for the open
  financial-column-masking item.

---

# 7. Bug Log

Newest first. **The highest-value field in each entry is "Wrong turns"** — the plausible-but-incorrect
theory that burned time, recorded so nobody pays for it twice. Template at §10.

## 7.1 · 2026-08-31 — Silent 1000-row truncation across reports (repo-wide sweep)

**Severity:** High — no crash, no error, just wrong numbers on screens used to make decisions.

**Symptom**
None. Every affected screen rendered confident, plausible, wrong figures.

**Root cause**
PostgREST caps a plain `.select()` at 1000 rows and returns success. Any query whose rows are
then aggregated client-side silently reports a truncated total. Found by sweeping every
`.from('<table>').select()` in `src/` against tables with >1000 live rows, then reading each hit.

**Confirmed, with live numbers**

| Where | Wanted | Got | Impact |
|---|---|---|---|
| `attributionReportService.ts` (quotes, 90-day default) | 7,331 | 1,000 | **86% missing** — every traffic-group share, conversion rate and revenue-per-quote in the CLADB5 Lead Attribution report |
| `attributionReportService.ts` (orders) | 1,154 | 1,000 | 154 orders never matched to quotes |
| `customersService.ts` (totalRevenue) | 1,161 | 1,000 | Customers page showed **$355,332.77 vs a true $399,495.53 — understated by $44,162.76** |
| `CompaniesPage.tsx` | 1,161 | 1,000 | every company's order count and revenue understated |
| `InboxPage.tsx` | 3,457 | 1,000 | oldest conversations invisible (benign direction, but accidental) |

**Fix**
`fetchAllPaged` for the three aggregating queries; an explicit `.limit(1000)` on the Inbox list so
the cap is intentional rather than accidental (it is ordered by recency and refetches every 15s, so
paging 3,457 rows would be wasteful — the point was to stop the truncation being invisible).

**Verified false positives** (read, not assumed): `FunnelAttributionReport.tsx` and
`orderService.ts` use `count: 'exact', head: true`; `quoteService.ts` is the already-paginated
Quotes page; `AssignOrderSection` reads 413 active orders; `CustomerHistoryPage` /
`CustomerAccountPage` filter to one customer; `SearchResultsPage` narrows via `.or(…ilike…)`.

**Lessons**
- This is the **fourth** instance of the same bug class (§7.2 storage scanner, §7.14 Quotes page,
  and both halves of this entry). `fetchAllPaged` has existed with tests the whole time — the
  problem is nobody reaches for it, because the broken version looks like it works.
- **Any `.select()` whose result is reduced/summed/counted client-side must be paged.** A filter
  does not make it safe unless the filter provably bounds the set under 1000.
- Re-run the sweep after adding aggregating queries — see §10.3.

---

## 7.2 · 2026-08-31 — Storage Cleanup offered live customer artwork for permanent deletion

**Severity:** Critical (near-miss). The delete button was one click from irreversible loss of live
customer files. Nothing was actually lost — saved only by a *second* bug that made deletes silently
no-op.

**Symptom**
Settings → Storage Cleanup reported "1004 files scanned, 731 orphaned". Deleting them appeared to
succeed, then the same kind of files "showed again" on rescan.

**Root cause — four separate defects in `src/services/storageCleanup.ts`**

1. **Reference list truncated at 1000 rows.** `getAllReferencedUrls()` called
   `supabase.from('orders').select(…)` and the same for quotes with **no pagination**. PostgREST
   silently caps at 1000. There are **1,156 orders and 9,445 quotes**, so the scanner saw 3,746 of
   9,868 live file references — **62% invisible, every one of them reported as "orphaned"** and
   offered for permanent deletion. Same bug class as §7.14; `fetchAllPaged` already existed with
   5 tests and this service simply didn't use it.
2. **Path-convention references not modelled at all.** `production-files` stores objects as
   `orders/<id>/…` and OrderPage renders them by bucket+folder — they are **never** written to
   `orders.production_file_urls` (only 15 orders have that column set, and those point at a
   different bucket). 389 of the 390 order folders match **live** orders. A URL-only check marked
   **all 526 as orphaned**.
3. **Listing truncated and non-recursive.** `list('', { limit: 1000 })` once at the root, recursing
   a single level. `order-attachments` holds 12,365 objects, so each scan saw a different 1,000 —
   which is why files appeared to "come back". And `production-files` objects sit two levels deep,
   so the bucket reported **0 files** while holding 526.
4. **Deletes failed silently.** `remove()` returns `{ data: [], error: null }` when nothing
   matches. The code checked only `error` and counted every requested path as deleted, so the UI
   reported "Deleted 731 files" while all 731 were still in storage (verified: all 7 files visible
   in the user's screenshot were still present afterwards).

**The lucky part:** defect 4 neutralised defects 1–3. Had the delete worked, the first click would
have destroyed live customer artwork.

**Wrong turns**
- Initially suspected the storage RLS policies changed earlier that day (§7.3). Ruled out by
  evidence, not assumption: the admin account is in `user_profiles`, passes the staff predicate,
  `authenticated` holds DELETE on `storage.objects`, and the DELETE policy is permissive — plus
  the scan itself proved SELECT worked. All four defects predate that work.
- **My own fix nearly made it worse.** Fixing the listing (defect 3) made the 526 production files
  *visible* — and therefore deletable — before the convention-awareness fix (defect 2) landed.
  Making a broken safety check see *more* data is not an improvement.

**Fix**
Paginate the listing by offset and recurse to depth (throwing rather than returning a partial set —
an incomplete listing is exactly how a live file gets mislabelled); route orders and quotes through
`fetchAllPaged`; add `getPathReferencedIds()` so path-convention references count as in-use;
chunk deletes at 100 and count `data.length` rather than assuming success; surface failures in the
toast instead of always reporting success.

**Verified** — recomputed server-side with no caps:

| Bucket | Objects | In use (URL) | In use (path) | Truly orphaned |
|---|---|---|---|---|
| order-attachments | 12,365 | 9,432 | 393 | 2,540 |
| production-files | 526 | 0 | 509 | 17 |
| quote-mockups | 4 | 4 | 0 | 0 |

Against the broken scanner's "731 of 1004". `tsc` clean, 104/104 tests pass.

**Lessons**
- **A destructive feature must prove a file is unused, not fail to prove it is used.** Absence of
  evidence was treated as evidence of absence, three separate ways.
- Not every file reference is a URL in a column. Path conventions are references too.
- `remove()` succeeding is not the same as `remove()` removing. Check the returned rows.
- Making a broken check see more data makes it more dangerous, not less — fix correctness before
  coverage.

---

## 7.3 · 2026-08-31 — `anon` could apply payments and enumerate every payment link

**Severity:** Critical. Not a breach — no evidence of exploitation — but three exposures reachable
by anyone who reads the anon key out of the public frontend bundle.

**Symptom**
None. Nothing failed, nothing alerted. Surfaced only because the Supabase security advisor was
opened for an unrelated reason.

**Root cause — three exposures**

1. **`apply_order_payment(bigint, numeric)` was executable by `anon`.** It has no in-function
   authorization check — it was written to be called only by `square-payment-webhook` holding the
   service role. Probed non-destructively with `p_order_id: -1` (returns before any write), it
   answered `P0001 "Payment amount must be a positive number"` — a `RAISE` from **inside the
   function body**, not `permission denied`. A well-formed call would have marked any order paid.
   The exploit was deliberately not completed.
2. **`payment_form_tokens` was SELECT-able by `anon` with no token filter** — `Content-Range:
   0-214/215`, every row. Customer names, emails, phones, shipping addresses, order values, and the
   live tokens themselves.
3. **`get_funnel_monthly_trend(integer)` returned live business metrics to `anon`** — quotes
   created, orders, conversions by month.

**Why the existing lockdown didn't hold — two independent defects**

- `add_apply_order_payment_rpc.sql` was **never applied** (the same migration behind §7.5). When
  the function was rebuilt by `restore_apply_order_payment_and_fix_payment_status`, the function
  came back and its REVOKE did not.
- **A second, independent failure mode affects other functions.** Reading `pg_proc.proacl`
  directly (`has_function_privilege('public', …)` does NOT resolve the PUBLIC pseudo-role — don't
  trust it) showed two different situations:
  - `apply_order_payment`, `admin_soft_delete_order` → `{postgres=X,anon=X,authenticated=X,service_role=X}`
    — **no PUBLIC entry**; `anon` held an *explicit* grant (Supabase grants EXECUTE to anon/authenticated
    on function creation). So `REVOKE … FROM anon` **would** have worked here. Open purely because the
    migration was never applied.
  - `loyalty_tier_stats`, `review_invitation_stats` → `{=X,postgres=X,authenticated=X,service_role=X}`
    — the leading `=X` is **PUBLIC**, and there is **no anon entry**, meaning those REVOKEs *were*
    applied and were **ineffective**: a role's privilege is the union of its own grants and PUBLIC's,
    so anon still executed them via PUBLIC.

  Both modes are real, on different functions, so a correct lockdown must revoke **PUBLIC *and* the
  explicit role grants** — which is what the fix does.
- A related misconception is recorded in that file's own comment — *"Service role ... bypasses the
  grant"*. It does not. `service_role` bypasses **row-level security**, not privileges. Revoking
  from PUBLIC without an explicit `GRANT ... TO service_role` would have broken the Square webhook.

**Wrong turns**
1. **Judging severity from the dashboard instead of the raw export.** The advisor screen was filtered
   to *Function Search Path Mutable*, so the first assessment was "a lint, not a breach — priority
   low." That was wrong: the same advisor also had `anon_security_definer_function_executable`, an
   entirely different and far more serious category, invisible in that view. **Read the full export
   (Export → JSON), not the visible page.**
2. The `search_path` warnings that dominated the screen — 148 of them — really were the low-priority
   item. Volume is not severity; a single row in a different category outranked all 148.

**Fix**
`supabase/migrations/security_lockdown_part1_anon_executable_rpcs.sql` — revokes from **PUBLIC**
first (the step that actually closes it), then grants EXECUTE back to exactly the roles that need it,
guarded with `to_regprocedure` so it is idempotent and tolerates schema drift. Adds
`get_payment_form_token(text)`, a `SECURITY DEFINER` by-token lookup returning only the columns
the public page renders — `attribution` (client_ip, UA, click IDs) and `created_by` (staff email)
are dropped, so it is strictly narrower than the `select=*` it replaces.
`...part2_revoke_anon_payment_tokens.sql` closes the table grant, **deliberately separate** because
applying it before the frontend ships would kill every live payment link.
`...part3_unguarded_anon_rpcs.sql` then swept the rest: every SECURITY DEFINER function `anon` could
execute with **no in-function guard at all** — worst were `recompute_all_loyalty()` (full-table
recompute, repeatable = trivial DB exhaustion), `use_gold_rush_upgrade()` (burns a customer's perk),
`auto_close_stale_sessions()` (force-closes staff clock-ins) and `get_attendance_stats()` (any
staff member's timesheet by uuid). Grantees came from real call sites, not assumption.

**Deploy order matters in both directions:** part 1 → deploy frontend → verify → part 2 → part 3.

**ALL THREE APPLIED AND VERIFIED 2026-08-31.** Confirmed externally with the public anon key:
`42501 permission denied` on `apply_order_payment`, `get_funnel_monthly_trend`,
`recompute_all_loyalty`, `auto_close_stale_sessions`, `use_gold_rush_upgrade`,
`get_attendance_stats`, and on the `payment_form_tokens` table (was 215 rows);
`get_payment_form_token` returns its one row with no `attribution`/`created_by`; and the live
payment page renders the form. Advisor `anon_security_definer_function_executable`: 56 → 40, and the
40 that remain all carry in-function guards.

**Standing check — re-run after adding any SECURITY DEFINER function.** The only row this should ever
return is `get_payment_form_token`:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prosecdef and p.prokind='f'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and pg_get_function_result(p.oid) <> 'trigger'
  and p.prosrc !~* '(is_admin|is_super_admin|has_permission|get_user_role|get_current_user_role|auth.uid|auth.jwt|RAISE EXCEPTION)';
```

**Lessons**
- `REVOKE … FROM anon` alone is not reliably a lockdown, and neither is revoking PUBLIC alone —
  EXECUTE can come from **either**. Revoke `PUBLIC`, `anon` **and** `authenticated`, then grant
  back explicitly to the roles that need it.
- **Read `pg_proc.proacl` to check, not `has_function_privilege('public', …)`** — that does not
  resolve the PUBLIC pseudo-role and will tell you PUBLIC has nothing when it does. In the ACL, a
  leading `=X/owner` (empty grantee) is PUBLIC.
- `service_role` bypasses RLS, not privileges. Every PUBLIC revoke needs a matching service_role
  grant or you break the server-side callers.
- A `SECURITY DEFINER` function with no in-function auth check is only as safe as its EXECUTE grant.
  Prefer both: gate inside the function *and* restrict the grant. `get_customer_last_login_times`
  does this correctly and is the model — it raised *"Only admins can view customer login times"* at
  the same time as the others were wide open.
- Public read on a table is not the same as public read of **one row by key**. If a page needs one
  row by an unguessable id, that's an RPC, not a table grant.

---

## 7.4 · 2026-08-30 — Payment page stuck on an infinite spinner

**Severity:** High — customers could not pay. Silent: no error, no Sentry alert, no console error.

**Symptom**
`login.pandapatches.com/pay/:token` showed the orange spinner forever. Intermittent — the same link
worked on some loads and hung on others. The network tab showed the token request returning `200`,
which made it look like a rendering problem rather than a data problem.

**Root cause**
`src/contexts/AuthContext.tsx` called `queryClient.clear()` on **any** auth event with no session:

```js
supabase.auth.onAuthStateChange((_event, newSession) => {
  if (!newSession) queryClient.clear();   // wipes the ENTIRE React Query cache
});
```

`AuthProvider` wraps every route, including the public `/pay/:token` form. Nobody is ever signed in
there, so Supabase fires `INITIAL_SESSION` with a null session on **every** load, and
`queryClient.clear()` wiped the cache **while the token query was still in flight**. A removed query
never notifies its observer, so the component was orphaned holding `isLoading: true` forever.

The fetch itself always succeeded — hence the `200` behind a permanently frozen spinner. Whether the
wipe landed before or after the query resolved was a race, which is why it was intermittent.

`src/services/supabaseClient.ts` had a second listener with the same hazard on `SIGNED_OUT`.

**Wrong turns** — the expensive part, don't repeat these:
1. **"The response body is stalling in `res.json()`."** The query sat at `status: pending` /
   `fetchStatus: fetching` while the network showed `200`, so a stalled body read looked like the
   obvious explanation. A `withDeadline` guard was written, shipped, and **changed nothing** — the
   page still spun for 50s with no timeout firing. Running the same helper by hand in that page fired
   correctly in 3.0s, proving nothing was hanging for it to catch.
2. **`X-Vercel-Mitigated: challenge` / HTTP 429 on asset requests.** Real, but a red herring — that's
   Vercel's bot challenge answering `curl`. A real browser solves it and gets `200`.

**What actually located it:** reading the live React Query cache out of the fiber tree. The cache
contained only `["profile", null]` — the `payment-token` query **was not in the cache at all**, while
its component was still mounted and rendering. An absent query with a live observer only happens if
something removed it.

**Fix**
Both listeners now track a `hadSession` flag and only clear on a genuine signed-in → signed-out
transition. Explicit `signOut()` still clears unconditionally, so the "don't leak the previous user's
data" guarantee is intact.

**Verified** — same harness, 8 fresh boots each, minutes apart on the same machine:

| | Result |
|---|---|
| Without the fix | 8/8 stuck spinner (cut off at 18s) |
| With the fix | 8/8 form rendered, 0.6–1.1s |

Re-run after restoring: 10/10, max 609ms. `tsc` clean, 104/104 tests pass.

**Lessons**
- A React Query observer whose query is removed from the cache **hangs forever with no error**. Never
  call `queryClient.clear()`/`removeQueries()` on a code path that can fire while an unrelated query
  is in flight.
- Global providers (`AuthProvider`) wrap public routes too. Anything auth-triggered must be safe on a
  page that never had a session.
- **A `200` in the network tab does not mean the app received the data.** Check the query cache, not
  just the network.
- Deploying a fix is not verifying it. Re-check the live page and confirm the symptom is gone.

## 7.5 · 2026-08-19 — `apply_order_payment` was missing from the database entirely

**Severity:** Critical (latent) — every balance payment would have silently failed to record.

**Symptom / cause:** the migration adding `apply_order_payment` was **never applied**, but
`square-payment-webhook` FLOW B calls that RPC on every balance payment. From ~2026-07-30 (last
success PP-11157), every "pay the remaining balance" link took the customer's money in Square and
silently failed to record it in the CRM — the webhook logged `payment apply failed`, released the
payment claim, and Square retried forever.

**Fix:** created it (migration `restore_apply_order_payment_and_fix_payment_status`) — row-locked
atomic increment, sets `payment_status`/`paid_at`, releases PENDING_PAYMENT→NEW_ORDER, returns
`(order_amount, new_amount_paid, new_payment_status, released)`. Verified against a live order.

**Outcome:** **no money was actually lost.** Square was checked on 2026-08-19: the 4 candidate orders
(PP-11243, PP-11266, PP-11202, PP-11191) are genuine unpaid balances, not dropped payments. The bug
was **latent** — no balance payment was attempted in the 2026-07-30 → 08-19 window; the next one would
have failed silently. **Don't re-flag those 4 as lost payments.**

**Also fixed in the same migration — the `payment_status` drift:** `record_manual_payment` and
`correct_order_payment` only ever bumped `amount_paid`, never `payment_status`/`paid_at` — so 973
orders read `'pending'` while paid, and only 18 had `paid_at`. Both RPCs now keep all three coherent.
Backfilled 23 → 901 orders correctly `'paid'`.

**Lesson:** a migration file existing in the repo is not evidence it was applied. When an RPC is
referenced by a deployed edge function, verify the function exists in the live database.

## 7.6 · 2026-08-08 — `square-payment-webhook` 500 on every call (~2-day outage)

**Severity:** Critical — Square payment→order creation silently broken for ~2 days.

**Symptom:** HTTP 500 on **every** call, all day. Last good webhook payment before the outage:
**PP-11212, 2026-08-06 22:43 UTC**. No `[square-payment-webhook]` logs on failures.

**Root cause:** `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10'` pulls
the Node `ws` package (`ws@8.x/denonext/ws.mjs`), which on cold boot in the Supabase edge (Deno)
runtime failed with `module "node:url" not found` → `TypeError: Cannot destructure property 'URL' of
'p(...)' as it is null`. That's an **UncaughtException that kills the invocation before any handler
code runs** — which is why there were no logs; the crash predates the try/catch. A poisoned esm.sh
bundle: the identical import still worked in `google-ads-conversions`.

**Fix:** switched to Deno-native `import { createClient } from 'jsr:@supabase/supabase-js@2'` (uses
built-in WebSocket, never imports `ws`). Deployed via the dashboard. Verified healthy: an unsigned
POST returns 400 "Missing signature" (handler runs) instead of 500. The boot crash happens before any
DB write, so no partial state; Square's ~72h retries replayed queued events safely via the
`payment.id` idempotency claim. *(The local editor shows a cosmetic `Cannot find module 'jsr:...'` —
tsserver can't resolve jsr specifiers; Deno resolves fine.)*

**⚠️ Backfill duplicate risk (learned here):** the `payment.id` guard only prevents webhook-vs-webhook
dupes. During the outage agents manually created orders; when Square replayed those payments after the
fix, the webhook created a **second** order it didn't know about. 4 duplicate pairs resulted —
Brittany PP-11220↔PP-11222, Al Johnson PP-11214↔PP-11224, Malia PP-11215↔PP-11225. Both twins fired
CAPI Purchase (Meta double-counted; reversed manually).

**Rule going forward:** after any webhook outage, check for manual-vs-webhook dupes (same
`customer_email`, one manual + one webhook row). **Keep the MANUAL order** (agents are working it),
soft-delete the webhook backfill twin via `deleted_at` — **NOT** `status=CANCELLED`, which would
double-reverse CAPI.

**Related fix:** CRM "Delete Permanently" = **soft** delete (`UPDATE orders SET deleted_at`),
admin-only. It genuinely FAILED from the browser with `new row violates row-level security policy for
table orders` — reproduced for admins, only when `deleted_at` changes, row-specific; the exact
RLS/WITH-CHECK cause could not be isolated remotely. Fixed by routing through
`public.admin_soft_delete_order(p_order_id bigint)` — SECURITY DEFINER owned by `postgres` (bypasses
orders RLS), enforces `is_admin()` in-function, writes ORDER_DELETED history + sets `deleted_at`.

## 7.7 · 2026-08-19 — `send-email` died with "Memory limit exceeded" on orders with artwork

**Severity:** High — every email on orders **with** customer artwork failed (e.g. PP-11296: 0 sent /
4 failed). Emails on orders with no files sent fine.

**Cause:** `send-email/index.ts` called `fetchFile(winner_file.url)` **unconditionally**, then — for
image winners — discarded the result and used the public bucket URL anyway. So each image was
downloaded and base64-encoded (~1.4× its size) for nothing. With a winner image + a gallery image
both in memory, the Deno edge runtime killed the invocation with `Memory limit exceeded`.

**Note:** a runtime kill = non-2xx. `send-email` otherwise returns 200 even on errors, so **a non-2xx
from it means a runtime kill or a Zod 400, not a normal failure.**

**Fix:** branch on the URL extension FIRST — images use the URL directly and are never downloaded;
only non-images (PDFs) are fetched + attached. Added a `maxMB` param to `fetchFile` so gallery files
are rejected from their `Content-Length` before the body is read.

**Debugging note:** the useful signal is in `function_logs`, not the HTTP status dump — query
`source = 'function_logs'` with `log_attributes['function_id'] = 'd56e5883-6602-4942-b484-1d066aa37e5a'`
(send-email) and look for `level = 'error'`.

## 7.8 · 2026-07-30 — PP-11151's $160 balance silently clobbered by an order edit

**Severity:** High — real money silently lost from the record.

**Cause:** the Square webhook does not bump `orders.updated_at` when recording a payment, so
`updateOrderDetails`'s optimistic lock couldn't detect a payment landing while an edit form was open.
The form held a stale `amount_paid` snapshot and wrote it back on save. The webhook set `amount_paid`
210; an order edit reverted it to 50; **no history was logged** because 50→50 looked unchanged from
the stale view.

**Fix + current state:** see §5.2 in full. `updateOrderDetails` strips payment fields;
`apply_order_payment` does a row-locked atomic increment; `correct_order_payment` is the audited path
for genuine corrections.

**⚠️ Sequel — the fix sat undeployed for a week and the bug recurred.** On 2026-08-01 agent Shuja set
`amount_paid` on PP-11176 to 50→1150→150 via the order-edit form (two `order_history`
`field_changed='amount_paid'` rows), which is only possible on the **pre-fix build**. The code was
correct; production was stale. **Lesson: "typechecks clean, not deployed" is not fixed.** Don't
re-diagnose a bug whose fix is sitting unpushed — check what's actually live first.

**Related report bug (fixed 2026-08-05):** `ReportsPage.tsx` (~L221) Payment Collections Breakdown /
"Recovered" summed only **positive** `amount_paid` deltas and discarded negatives, so a corrected-down
payment (+1100 then −1000) showed inflated ($1,100 instead of net $100). Changed the filter to
`=== 0` so negatives net out. Fixes retroactively for all agents (live computation).

## 7.9 · 2026-08-19 — Lead source silently wiped on every order edit

**Severity:** High — destroyed marketing attribution, repeatedly, invisibly.

**Cause + fix:** see §5.5. Proved via `order_history`: PP-11232 → shuja reset it to Direct; PP-11245 →
furqanali blanked it. This is what kept reverting attribution backfills.

**Lesson:** a `<select>` whose value isn't in its options renders blank and writes blank on save.
**Any enum a backend resolver can emit must exist in the corresponding frontend option list.**

## 7.10 · 2026-08-19 — Payment-form shipping address silently dropped

**Cause:** the customer pay page collected a shipping address and `create-square-checkout` accepted it
in its zod schema, but there was **no `payment_form_tokens.shipping_address` column** and it wasn't in
the token UPDATE — so it was silently dropped and every payment-form order arrived with no address.

**Fix:** column added; `create-square-checkout` persists it; webhook Flow A writes `shipping_address`
and parses `ship_city`/`ship_state`/`ship_postal`. The agent payment form now has a Shipping Address
field that prefills the customer page.

**⚠️ Address parsing lives in `src/utils/parseUsAddress.ts` (6 tests) and is MIRRORED inside the
webhook — keep them in sync.** The state must validate against a real US state list or street
suffixes like "St" get read as states.

## 7.11 · 2026-08-20 — Blank navy screen after deploy (iOS first)

**Cause + fix:** see §6.3 in full — legacy `routes` in `vercel.json` silently disabling modern
`headers`, causing `index.html` to be cached and point at content-hashed chunks that no longer
existed. `ChunkErrorBoundary` **cannot** catch this because no JS runs at all.

**Lesson:** an error boundary can only catch failures that happen *after* the app mounts. A caching
bug that prevents mounting is invisible to every in-app safety net.

## 7.12 · 2026-07-19 — Google Ads "Quote Converted" feed silently uploaded nothing for 4 days

**Cause:** `google_ads_data_manager_export_crm` had been left as a **static table** by migration
`test_crm_export_as_real_table` (a Data-Manager-setup test never converted back) — frozen at
2026-07-15 with 95 rows while `_crm_src` had live data.

**Fix:** replaced in one transaction by a same-name, same-column passthrough **view** of `_crm_src`
(migration `unfreeze_gads_crm_export_swap_table_for_view`). Verified identical column
names/order/types, 0-row diff vs `_crm_src`, correct grants. Google dedupes overlapping rows on
Transaction ID (`order_number`).

**Lesson:** a test artifact that shadows a production object with the same name fails **silently and
indefinitely**. Anything created "temporarily as a real table" needs a revert task attached.

## 7.13 · 2026-08-03 — `customer_flags` upsert threw 42P10

**Cause:** `customer_flags` had no unique index on `customer_email` (only its PK), so
`setPremiumStatus`'s upsert (`onConflict customer_email`) threw 42P10. Pre-existing latent bug, not
upgrade-related. **Fix:** added `customer_flags_customer_email_key` (migration
`add_customer_flags_unique_email.sql`).

## 7.14 · 2026-08-28 — Older quotes invisible on the Quotes page

**Cause:** a single oversized `.limit()` — **PostgREST silently caps responses at 1000 rows regardless
of the number requested**, so anything past the cap vanished with no error.

**Fix:** page through in batches (`fetchAllPaged`, 5 tests). **Lesson:** never rely on a large
`.limit()` against PostgREST; the truncation is silent.

## 7.15 · 2026-08-28 — Two other same-day fixes

- **Duplicate `INTERNAL_NEW_ORDER`** (PP-11361 got two internal emails) — a redundant send inside the
  webhook for cases the database webhook already covered. Now three mutually-exclusive paths (§4.3).
- **Meta Lead / InitiateCheckout sent a malformed `value: 0`** when there was no real order amount.
  Meta counts that as a genuine zero-value event, quietly dragging down reported AOV. Both now omit
  `value`/`currency` entirely in that case.

---

# 8. Programs & Project Status

## 8.1 Loyalty Tier Program (CL86F1) — **DEPLOYED + LIVE** since 2026-07-29

Bronze/Silver/Gold by **lifetime paid value** (Square-confirmed `orders.amount_paid`; excludes
CANCELLED/REFUNDED/PENDING_PAYMENT/soft-deleted). Separate from the 365-day reorder price-lock and
from the MASTER v3 review program. Codes are `PANDA-{TIER}-XXXXXX`, email-bound. **Tier only goes up
automatically.**

| Tier | Threshold | Perks |
|---|---|---|
| Bronze | $1,000 | 5% code, single-use, expires in 90 days |
| Silver | $5,000 | 5% code, free Velcro backing, priority mockup queue, no expiry |
| Gold | $10,000 | 10% code, one free rush upgrade per quarter, personal outreach (drafted, not auto-sent) |

**Live components:** 5 migrations applied; 4 edge functions deployed `verify_jwt=false`;
`LOYALTY_VALIDATE_SECRET` + `LOYALTY_CRON_SECRET` set; vault `loyalty_cron_secret` matches; crons
scheduled (`loyalty-reconcile-nightly` + `loyalty-email-daily` @16:00 UTC).

- `add_loyalty_program.sql` — tier fields on `customers`, `loyalty_codes` table,
  `recompute_customer_loyalty()`/`recompute_all_loyalty()`, `gen_loyalty_code()`, an orders
  AFTER-UPDATE trigger, and a one-time backfill that **silences historical award emails** (stamps
  `award_email_sent_at`) so only NEW crossings email.
- `validate-loyalty-code` — website server calls it; enforces email-match/expiry/single-use/
  calculator-only-no-stacking; returns `{valid,tier,percent,reason}`. Auth via `x-loyalty-secret`.
- `loyalty-status` — website reads account tier/codes by email. Same secret.
- `loyalty-email-cron` — awards + expiry + nudge; 14-day global cap, quarterly nudge cap, skips
  open-remake customers.
- Redemption engine, `priority_mockup` flag, Gold quarterly rush ledger, per-tier Customer-Match view
  `google_ads_loyalty_tier_audience`, `loyalty_tier_stats()` Reports RPC.
- **Frontend:** LoyaltyBadge + LoyaltyProgress; Customer type/mapper carry `loyaltyTier` +
  `lifetimePaidValue`; CustomerAccountPage tier badge + progress bar + LoyaltyCodesPanel; Reports
  "Loyalty & Reviews" tab; CustomersPage tier column + server-side tier filter; LoyaltyOrderPanel in
  OrderForm (sales/admin only — production never sees it) showing tier + perks + usable codes with an
  Apply that **records** the code but never changes `orderAmount`; OrderPage ⚡ Priority badge.
- **Webhook:** `square-payment-webhook` reads Square ORDER `metadata.loyalty_code` +
  `metadata.loyalty_discount_percent` and writes them on both order-creation paths, auto-firing the
  redemption trigger. **The website must set those two metadata fields on the Square ORDER.**

**KEY FINDING:** the CRM order form prices with a single manually-typed `orderAmount` (no itemized
Velcro/rush lines) — the calculator lives on the **website**. So free-Velcro/rush auto-zero are
website concerns; on the CRM they're informational only.

**Still open:** `add_loyalty_admin_override.sql` not yet applied (audit table + ADMIN-only
grant/revoke/reissue RPCs + LoyaltyAdminPanel are built); Zoho Campaigns tier field in the CRM→email
export (unclear where that export lives); real E5 unsubscribe link (currently reply-based).

## 8.2 Review Generation (MASTER v3) — **LIVE** since 2026-07-29

- `send-email`: plain-text `CUSTOMER_REVIEW_INVITE` + `CUSTOMER_REVIEW_REMINDER` (from "Imran at
  Panda Patches" `<sales@>`, single reply-to, `text/plain`). The earlier on-delivery Trustpilot CTA on
  `CUSTOMER_DELIVERED`/`CUSTOMER_FEEDBACK_REQUEST` was **reverted** — those emails don't ask for
  reviews anymore.
- `add_review_program.sql`: `orders.delivered_at` (+ backfill, 330 orders) + `trg_set_order_delivered_at`
  + `review_invitations` ledger (service-role locked) + `review_invitation_stats()` (ADMIN/SALES_AGENT).
- `review-invite-cron` (deployed `verify_jwt=false`, gated by `x-cron-secret`): invites orders
  delivered 2–5 days ago (not opted out, claim-first), one reminder at +5 days.
- `schedule_review_invite_cron.sql`: pg_cron `review-invite-daily` at 15:00 UTC → pg_net → function.
  Vault: `project_url`, `review_cron_secret`, reusing the existing `service_role_jwt`.
- **Compliance:** ask once + one reminder, no incentive, no gating.

**Item #3 (baselines) — DONE.** Shipped-to countries from real data: US(346), CA(8), GB(4), NZ(4),
FR(2), DE(1), plus 585 blank-country orders → `shippingCountries: ["US","CA","GB","NZ","FR","DE"]`
(**AU has ZERO orders**). B5 stat: **median 22 pieces, 925 orders** (the site's old "≈20/896" is
stale) → `medianOrderPieces: 22, orderDatasetCount: 925`.

**Item #2 (city-page dataset) — NOT BUILDABLE** (fails the brief's own ≥20-per-metro gate): only ~330
delivered / ~347 post-shipment addressed orders, scattered one-per-city nationwide; `shipping_address`
is free-form. Houston (HQ metro) = only 4. No metro ≥20.

**Still open:** Reports UI card not built (backend `review_invitation_stats()` exists; meaningful
rate/trend metrics need the Trustpilot API); the Trustpilot email link is `/evaluate/pandapatches.com`
but the website dev asked it match the site's `/review/` profile — **decision still OPEN**, a
one-constant swap in `send-email`. ⚠️ The `REVIEW_CRON_SECRET` value was pasted in plaintext in a chat
on 2026-07-29 — **rotate when convenient**.

## 8.3 Lead-Source Attribution (CLADB5) — **COMPLETE** (built, deploy = git push)

**Key data-model finding:** quote `attribution` JSONB contains `traffic_source` (the website's
resolved traffic: "Google (Organic)", "Facebook Ads (id)", …) + `form_name` (the source/form:
"Homepage Hero Form", …) + utm_*, fbclid, referrer, fbc/fbp, client_ip/ua. **traffic** =
`resolveTrafficGroup(attribution)` in `leadSource.ts`; **source** = `attribution.form_name`.

`heard_about` was **definitively not in the CRM** (confirmed via a full key audit) — the website's
quote-notification email showed it but never persisted it. **Now built:** the website ships
`attribution.heard_about` (commit f3d5961) with 9 literal options — Google Search, Google Ads,
Facebook / Instagram, ChatGPT / Claude, YouTube, Reddit, Friend / Word of mouth, Returning customer,
Other (free-text). No "Grok"; ChatGPT+Claude **combined**; Google Search ≠ Google Ads.
`HEARD_ABOUT_OPTIONS` + `resolveHeardAbout(attribution, instructions)` read it, falling back to a
historical "Source: X" in `instructions`.

**Built:** `leadSource.ts` (`TrafficGroup`, `TRAFFIC_GROUPS`, `groupTraffic` — AI group = all
LLM/assistant sources incl. Google AI Overview); `attributionReportService.ts` (quotes in-window +
orders from window start, `deleted_at` null, normalized-email matching);
`LeadSourceAttributionReport.tsx` (by-traffic table, by-heard-about table, traffic×heard-about matrix
with the ChatGPT/Claude column highlighted, weekly trend, CSV export); Reports "Lead Attribution" tab
(ADMIN only); `add_quote_is_duplicate.sql` (`quotes.is_duplicate` + backfill + BEFORE-INSERT trigger +
index); QuotesPage rewritten client-side with traffic chips (All + 7 groups, live counts, URL
persistence via `?traffic=slug`), heard-about dropdown (`?heard=`), heard-about badge per row,
date-range presets (30/90/365d, default 90), client-side search + pagination.

## 8.4 City Delivery Pages (CL38D1) — CRM side done; website builds the pages

State-level model, website repo owns the pages. **Qualifying states (≥20 delivered, derived from
free-text `shipping_address` since `ship_state` is new/empty): NY, CA, TX only.** IL=17 (watchlist).
**Wave-1 cities (CEO-approved, restore on original 301'd slugs):** New York City
`/custom-patches-in-new-york`, Los Angeles `/custom-patches-los-angeles`, Austin
`/custom-austin-patches` — top 3 by GSC clicks within qualifying states (NYC 45 / LA 41 / Austin 24).
Wave 2 (+3) ≥2 weeks later if no drop.

**Publish values (July 2026):** state delivered counts NY 23 · CA 25 · TX 24 (lock CA — two tally runs
gave 24 vs 25). City transit (real Jul 28–31 shipments): NYC 3 · LA 3–4 · Austin 3 business days.
Origin = Karachi facility. Rush = DHL 2–3 days, 5PM ET cutoff.

**Two claims DROPPED — the data can't back them honestly:**
1. **Median door-to-door.** `orders.delivered_at` is **batch-entered** (manual status trigger), not
   real delivery times — PP-10067 & PP-10169 share an identical `delivered_at` 163/128 days after
   shipping; NY median computed to 45 business days. Publish state **count only**. ⚠️ **The structured
   capture added is `ship_city`/`ship_state`/`ship_postal` (LOCATION), NOT delivery timestamps** —
   honest medians will not accrue until a carrier delivery webhook (FedEx/DHL → delivered event) or
   disciplined manual delivered-date entry writes a real `delivered_at`. Not yet built.
2. **Org-types-served.** The CRM stores the individual purchaser, not their org. Keyword
   classification of delivered+shipped orders in NY/CA/TX returned only individuals + noise, zero
   verifiable fire depts/agencies/teams. The `organization` column now exists to make this possible
   **later**.

**Structured geo capture built 2026-07-31:** `add_structured_ship_location.sql` adds
`orders.ship_city/ship_state/ship_postal` (+ metro index; `country` already existed, ~87% captured on
recent orders). OrderForm has structured City/State/ZIP inputs; `square-payment-webhook` FLOW A2
stores them from `order_data` (defensive: accepts flat, `city/state/zip`, or nested `shipping{}`
shapes). **Clean capture ≠ qualifying metros** — city pages still gate on ≥20 deliveries concentrated
in one metro, a volume outcome, not a data-capture one.

## 8.5 Invoice & Order Numbers (CL0FAA) — **DONE** 2026-08-27

- **§1 invoice numbers + §2 auto PAID-invoice email** — done in this repo. `orders.order_number`
  (PP-xxxxx) is canonical; the invoice number is **derived** (`INV-{order_number}`), never stored
  separately. `square-payment-webhook` builds a PAID invoice PDF (pdf-lib via `npm:`) and sends **one
  combined** customer email (payment + invoice attached + portal account link) per payment event,
  replacing what used to be up to 3 separate emails.
- **§3 canonical order number on the customer portal** — split across two repos. This repo added
  `orders.legacy_customer_ref` (backfilled by the website dev, 1,125/1,125 rows) + `orders.skip_auto_invite`,
  both indexed, and fixed customer-facing email links from `login.` to `www.`. Website repo
  implemented the display fix, dual-identifier lookup (`order_number` or raw `id`), 308 redirects for
  legacy numeric URLs, and page-title metadata.
- **Found along the way:** `orders.order_number` had **zero indexes** despite being unique/never-null
  and being the customer portal's own lookup predicate — added `idx_orders_order_number` as a UNIQUE
  index.
- **Also found:** the CEO's brief paired "1149" and "PP-11248" as the same order to illustrate the
  problem — **they aren't** (`id 1149` → `PP-11222`; `PP-11248` → `id 1175`, drifting offset). The two
  numbering schemes are genuinely unrelated and not derivable from each other.

## 8.6 First-response time — **UNPROVABLE** today (CL59AC)

The CRM **cannot** measure human first-response time. The only signal, `quotes.email_sent_at`, is
stamped programmatically the instant a quote is created — median AND p90 computed as
`email_sent_at - created_at` over staffed hours (Mon–Sat 11a–7p ET, 90d) came back **0 / 0 minutes
(n=36)**. That measures the auto-send, not a person replying.

True response time = (customer's inbound first touch) → (first HUMAN reply); the CRM captures neither
cleanly. Real instrumentation is **cross-system** (website form + email intake + Meta chat first-touch,
plus separating the human reply from the automated send) — a project, not a column.

**Honest framing (preserve when relaying):** this is NOT an overclaim correction — ops likely DOES
reply in ~1–5 min; it's just currently unprovable. Sub-5-min response ≈ 2.6× close rate, so
instrumenting converts an invisible strength into a provable one and gives a real ops SLA metric.

Decision doc: `docs/first-response-instrumentation-decision.md` — Option A (full cross-system),
Option B (web-quote-only Phase 1, recommended if the claim matters), Option C (don't build, current
default). **Do not publish the claim until A or B is built.**

## 8.7 Google Ads Data Manager migration

Conversion tracking migrated (2026-07-15) from the dead legacy `UploadClickConversions` API (the
account was never allowlisted, with no path to get allowlisted) to Google Ads **Data Manager**
connecting **directly to Supabase Postgres**. Export objects in `public`:

- `google_ads_data_manager_export` (view) → "Direct Purchase"
- `google_ads_data_manager_export_leads` (view) → "Quote Submitted (CRM)"
- `google_ads_data_manager_export_crm` (view) → "Quote Converted to Order (CRM)"; thin passthrough of
  `..._crm_src` (which holds the live query) — see §7.12
- `google_ads_data_manager_export_customers` (view) → Customer Match feed: transacted customers +
  leads from `quotes` last 540 days, deduped by email (~4,200 rows), **excludes anyone in
  `customer_privacy_optouts`**, phones via `normalize_phone_e164()` (conservative: NULL over wrong)

**Security state:** `anon`/`authenticated` revoked from all google_ads objects (they'd had FULL
default grants). `google_ads_data_manager_ro` reads `export`, `export_leads`, `export_customers` only;
`google_ads_data_manager_crm_ro` reads exactly the 5 export relations (it previously could read ALL 36
public tables **including payments** via a default-privilege auto-grant — now dropped). Data Manager
connects over the Postgres protocol as the `_ro` roles (`anon`/`authenticated` are NOLOGIN, so revokes
can't break the connections). **Role passwords are NOT in git**; if lost:
`ALTER ROLE <name> PASSWORD '<new>'` + re-enter in the Data Manager connection form.

**Remaining human steps (Google Ads UI):** connect `..._export_customers` as a PostgreSQL source with
use case **Customer list** (not conversions), name the audience `CRM Customers (auto-sync)`, attach as
Observation to the Core Search campaign (ID 24044777165).

In-app, `google-ads-conversions` hooks still exist on quote creation and quote→order conversion but
compute what they *would* send and log a `SKIPPED` row instead of calling Google.

---

# 9. Known Landmines & Open Items

## 9.1 🚨 Five edge functions still on the fragile `esm.sh` import
`google-ads-conversions`, `super-handler`, `meta-admin`, `send-meta-message`, `store-attribution` all
still use `esm.sh/@supabase/supabase-js@2.49.10` and can hit the same cold-boot crash that caused the
2-day outage (§7.6). **Migrate to `jsr:` if any start 500ing** — and opportunistically whenever one is
touched. Most likely to surface **after a cold start** (a Postgres upgrade, a long idle period).

## 9.1b 🚨 Every function REVOKE in this repo omits `PUBLIC` — and is therefore ineffective

EXECUTE can reach `anon` by **two** independent routes — an explicit grant (Supabase adds one when a
function is created) and the PUBLIC default — and a role's effective privilege is the **union** of the
two. Closing one route leaves the other open. Verified in this database: `apply_order_payment` was
open via an explicit anon grant with no PUBLIC entry, while `loyalty_tier_stats` was open via PUBLIC
with no anon entry. So the pattern used throughout this repo —

```sql
REVOKE ALL ON FUNCTION public.f(...) FROM anon, authenticated;   -- ❌ does nothing
```

is not sufficient on its own. The correct form revokes every route, then grants back explicitly:

```sql
REVOKE ALL     ON FUNCTION public.f(...) FROM PUBLIC;             -- ✅ all three lines
REVOKE ALL     ON FUNCTION public.f(...) FROM anon;
REVOKE ALL     ON FUNCTION public.f(...) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.f(...) TO service_role;         -- and/or authenticated

-- Check with:  SELECT proacl FROM pg_proc WHERE proname='f';   -- leading "=X/owner" means PUBLIC
```

The `GRANT` is **mandatory**, not optional: `service_role` bypasses row-level security, **not**
privileges. Revoking PUBLIC without regranting breaks every server-side caller — the Square webhook
included. See §7.3; corrected in `security_lockdown_part1_anon_executable_rpcs.sql`.

**Also: run the advisor from the raw export, not the dashboard view.** The dashboard filters by issue
type, and §7.3 was invisible behind 148 lower-priority `search_path` rows. Export → JSON.

## 9.2 Undeployed / unapplied work
- `add_loyalty_admin_override.sql` — built, **not applied**.
- Ship-By reminder feature (`add_ship_by_reminder_date.sql`, `orders.ship_by_date`, OrderForm
  checkbox-reveals-date, ShipByPill on OrderPage + AllOrdersPage) — typechecks clean, **not deployed**.
- Anything else marked "typechecks clean, NOT deployed" above. **§7.8's sequel is the cautionary tale:
  a correct fix that isn't pushed is not a fix.**

## 9.3 Data-quality caveats
- `updated_at` is **not** a reliable staleness signal (982 rows bumped by a backfill) — use `created_at`.
- `orders.delivered_at` is batch-entered for historical orders; `delivered_at_estimated=true` marks
  bulk-closed estimates. Don't compute delivery-time medians from estimated rows.
- `organization` is empty on historical orders (no backfill — populate going forward).
- The live schema has changes not captured in `supabase/migrations/` — **the live schema is the source
  of truth.**

## 9.4 Open security-advisor items (2026-08-31 review — the anon-RPC items are DONE, see §7.3)

- ~~**57 `authenticated_security_definer_function_executable`**~~ — triaged and closed 2026-08-31 (`security_lockdown_part5_authenticated_staff_scoping.sql`). `authenticated` covers 583 portal customers, not just 12 staff; 11 staff-domain functions had no staff gate — worst was `use_gold_rush_upgrade(p_customer_id, …)`, which takes the customer id as a **parameter with no self-check**, so one customer could burn another's Gold perk. Eight dropped to `service_role` (no frontend caller anywhere — the website repo makes **zero** `.rpc()` calls); `auto_close_stale_sessions` kept `authenticated` plus an in-function staff gate. Re-running the triage now returns only `get_payment_form_token` and `get_work_date`, both intentional.
- ~~**`get_current_user_role()` returns `"AGENT"` to anon**~~ — **FIXED 2026-09-01**. Now returns the
  sentinel `'NONE'`. **Not NULL** — the only consumer gates on
  `IF get_current_user_role() <> 'ADMIN' THEN RETURN`, and `NULL <> 'ADMIN'` evaluates to NULL, which
  `IF` treats as FALSE: the guard would be skipped and every staff profile returned to anon. A
  non-matching sentinel is the safe shape here; `get_user_role()`'s `'USER'` default is correct for
  the same reason and was deliberately left alone. Verified: anon now gets `"NONE"`, and
  `get_all_user_profiles_for_admin` still returns `[]` to anon.
- ~~**`function_search_path_mutable`**~~ — **FIXED 2026-09-01**. 54 functions pinned to
  `search_path = public, pg_temp`. `pg_temp` goes **last**: Postgres searches the temp schema first
  unless it is named explicitly, and creating temp objects is the one shadowing route a plain
  `authenticated` user actually has. Not Supabase's documented `''`, which would require every
  reference in every body to be schema-qualified and would break them.
  **31 remain flagged and always will** — they are extension-owned (`pg_trgm` is installed into
  `public`), so `ALTER FUNCTION` fails with `42501: must be owner of function gtrgm_in`. Expected;
  do not re-investigate.
- ~~**`rls_enabled_no_policy` × 4**~~ — **FIXED 2026-09-01**. `square_pending_orders`,
  `square_processed_payments`, `square_webhook_events` and `ai_generation_blocklist` had RLS enabled
  with no policies (correct, deny-by-default) but **still carried SELECT/INSERT/UPDATE/DELETE grants
  to anon and authenticated** — RLS was the only thing standing between the public and
  `order_data`, which holds customer name, email, phone, shipping address and artwork URLs. Now
  locked at both layers. `customer_privacy_optouts` and `review_invitations` were already correct.
- **`extension_in_public` (`pg_trgm`)** — WON'T FIX. Relocating it means dropping and rebuilding
  every trigram index that depends on it. Cosmetic lint; accepted.
- **`rls_policy_always_true`** on `web_vitals_log` / `performance_metrics` INSERT — ACCEPTED.
  Browser telemetry must be able to insert unauthenticated; the real mitigation is retention, not
  RLS. ⚠️ `web_vitals_log` is at 21,453 rows and its only cleanup is a **one-off** cron (jobid 5)
  that truncates on 2026-09-20 then unschedules itself — worth making recurring.
- ~~**`order_notes` / `form_feedback` readable by any authenticated user**~~ — **FIXED 2026-09-01**
  (`scope_order_notes_and_form_feedback_to_staff.sql`). Both had `SELECT ... USING (true)` for
  `authenticated`, which is not "staff" — it covers 583 portal logins plus anyone who self-registers.
  `order_notes` holds internal sales notes, customer-call records, complaints and 1–5★ quality
  ratings. Now staff-scoped. Found while looking at the Auth dashboard, not from an advisor lint —
  **the advisor never flagged it**, because a `USING (true)` SELECT policy is only reported for
  INSERT/UPDATE/DELETE.
- ⚠️ **Auth dashboard: `Confirm email` is OFF while `Allow new users to sign up` is ON.** Anyone can
  register with an address they do not own and immediately hold an `authenticated` JWT — 20 users
  currently have `email_confirmed_at IS NULL`, and 2 exist in neither `user_profiles` nor
  `customer_profiles`. This is why "authenticated ≠ trusted" keeps mattering (§7.3, §9.4). Turning
  Confirm email ON is a dashboard change; check first whether the customer-portal invite flow
  depends on unconfirmed sign-in, since invited users arrive via a link rather than a password.
- ⚠️ **`auth_otp_long_expiry`** — OTP lifetime is over an hour; Supabase recommends under. Dashboard
  only (Authentication → Sign In / Providers → Email), not reachable via SQL or MCP.


## 9.4b Smaller open items
- `customer_privacy_optouts` is checked by the **review-invite cron only** — the loyalty cron does not
  consult it (§5.4).
- The `QUALITY_ASSURANCE` template id sounds internal but the code sends it to the **customer** —
  worth confirming with the team.
- `orders.paypal_order_id`/`paypal_capture_id` + `paypal_pending_orders` appear unused (no PayPal edge
  function) — confirm before treating as active.
- The `email_templates` registry table is unused; real templates are hardcoded in `send-email`.
- `REVIEW_CRON_SECRET` was pasted in plaintext in a chat 2026-07-29 — rotate when convenient.
- Trustpilot link `/evaluate/` vs `/review/` — decision open (§8.2).

---

## 9.5 🚨 Making a public storage bucket private does NOT purge the CDN

Applied 2026-09-02 (`task_0_2_make_production_files_private`): `storage.buckets.public = false`
on `production-files`. Origin enforces it immediately — but Supabase Storage serves
`/object/public/...` through Cloudflare with `Cache-Control: public, max-age=3600`, and the
flip does **not** invalidate what the edge already holds.

Measured right after the flip, same URL, 10 sequential signed-out fetches:

```
CF-Cache-Status: BYPASS  → 400   (origin, correct)
CF-Cache-Status: HIT     → 200, 144,005 bytes   (stale edge copy, still serving the file)
```

Both outcomes, alternating, from one machine — different edge nodes. An object that had never
been fetched (a completion photo) returned 400 on every attempt, which is what distinguishes a
cache artefact from a failed flip.

**Consequences**
- The exposure window after any bucket flip is **up to 1 hour per edge node**, and it applies to
  browser caches too. It is bounded and self-clearing; it is not a failed migration.
- Only objects fetched publicly shortly before the flip are affected. Everything else is private
  from the moment the `UPDATE` commits.
- **Do not conclude a flip failed because one URL still returns 200.** Re-check with several
  requests and read `CF-Cache-Status`, or probe an object nobody has opened.
- If a future flip ever needs to be immediate, a cache entry is only invalidated by touching the
  object (upsert/move/delete). Not worth doing for 528 machine files; it mutates production data
  to buy an hour.


# 10. Conventions

## 10.1 Adding a bug-log entry

Add to **§7**, newest first, using this template. Fill in every field, but **Wrong turns** is the
point of the entry — the plausible-but-incorrect theory that burned time saves the next person more
than the fix does. Record how the fix was **verified**, not just that it shipped.

```markdown
## 7.N · YYYY-MM-DD — Short title

**Severity:** …

**Symptom**
What was seen. Include anything that made it look like something else.

**Root cause**
The actual mechanism, with file paths.

**Wrong turns**
Theories that looked right and cost time. Highest-value field.

**Fix**
What changed and why it's safe.

**Verified**
How it was proved — ideally a before/after with the same harness.

**Lessons**
Generalizable rules, not restatements of the fix.
```

## 10.3 Sweep: find silent 1000-row truncation

Run after adding any query whose rows are aggregated client-side. Flags every
`.from('<big table>').select()` that has no `.range()`/`.limit()`/`.single()`/`fetchAllPaged`,
splitting filtered from unfiltered. **Read every hit** — roughly two thirds are false positives
(`count: 'exact', head: true`, already-paginated pages, single-record filters).

```bash
# tables over 1000 rows
psql> select relname, n_live_tup from pg_stat_user_tables
      where schemaname='public' and n_live_tup > 1000 order by n_live_tup desc;
```

Then grep `src/` for `.from('<table>').select(` on each and check the following ~8 lines for a
bound. The full script used on 2026-08-31 is in the session log; it took the list from 15 hits to
4 real bugs.

## 10.2 Ground rules learned the hard way

- **"Typechecks clean" ≠ deployed ≠ verified.** Three separate states (§7.8, §7.4).
- **A `200` doesn't mean the app got the data** (§7.4).
- **A migration file in the repo doesn't mean it was applied** (§7.5).
- **Error boundaries can't catch failures that prevent mounting** (§7.11).
- **PostgREST silently caps at 1000 rows** (§7.14).
- **Silent failures are the expensive ones.** Most entries in §7 threw no error, alerted nothing, and
  were found only because someone noticed a symptom downstream. When adding a code path that can fail,
  ask what makes the failure *visible*.

---

<div align="center">

**Panda Patches CRM · Running in production**

*React 18 · TypeScript 5 · Vite 5 · Supabase · Tailwind CSS · Vercel*

</div>
