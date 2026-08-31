<div align="center">

# Panda Patches — CRM & Order Management System

**Production-grade · Full-Stack · Custom Manufacturing Operations Platform**

[![React](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=flat&logo=vite&logoColor=white)](https://vite.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)](https://vercel.com)

**The internal operating system that runs the Panda Patches business — leads, quotes, orders, production, fulfillment, payments, loyalty, reviews, and financial reporting, all in one place.**

</div>

---

## What Is This?

This is the **staff-facing CRM and order-management dashboard** for Panda Patches, a custom manufacturing business (patches, apparel, branded merchandise). It runs the full operational lifecycle: a lead comes in, becomes a quote, converts to an order, moves through production and QA, ships, gets paid, and feeds into financial reporting and loyalty tracking — all tracked in one application with real-time updates across the team.

It's a React + TypeScript single-page app backed by Supabase (PostgreSQL, Auth, Storage, Realtime, and Edge Functions), deployed on Vercel. A large share of the actual "system" isn't UI at all — it's the automation layer: Postgres triggers, Supabase Edge Functions, and cron jobs that fire emails, sync marketing pixels, award loyalty tiers, and keep payment state consistent without anyone clicking a button. This README documents that layer in detail, since it's the part that's easiest to lose track of.

> **📘 Full project knowledge base:** [`PROJECT-KNOWLEDGE.md`](PROJECT-KNOWLEDGE.md) — architecture, data model, every automation, the operating rules that must not be broken, the bug log (with the wrong turns), and the status of every in-flight program. **Read it before changing anything non-trivial.** This README is the overview; that file is the reference.

> **Scope note:** The **customer-facing portal** (customer login, order tracking, file downloads) lives on the marketing website (`www.pandapatches.com`), a separate repo. This repository is the **internal staff CRM** plus the shared serverless backend (Supabase Edge Functions — used by both this CRM and the website) and the public **agent-generated payment links** (`/pay/:token`).

---

## Feature Overview

### Orders & Quotes
- **Full order lifecycle** across 14 statuses (`NEW_ORDER` → `AWAITING_CUSTOMER_APPROVAL` → `APPROVED`/`IN_PRODUCTION` → `QUALITY_ASSURANCE` → `SHIPPED` → `DELIVERED`, plus `PENDING_PAYMENT`, `REVISION_REQUESTED`, `REMAKE`, `COMPLETED`, `CANCELLED`, `REFUNDED`, `FEEDBACK`). See [Order Lifecycle](#order-lifecycle) below.
- **Order detail** with status timeline, full change history (every field change logged with user + timestamp), communications log, internal notes, and file attachments (mockups, production files, customer attachments, shipping docs).
- **Quotes** with one-click **convert-to-order** — customer details, design specs, pricing, and marketing attribution all carry over. Quotes are also created and converted automatically when a customer pays a quote's Square link directly (no manual conversion needed).
- **Order assignment** — admins assign orders to sales agents, with an unassigned queue and per-agent workload view.
- **Bulk actions** (bulk cost entry, bulk close-to-delivered), server-side pagination/filtering, global search (now covers unconverted quotes too, not just orders), and quick-view drawer.

### Customers & Companies
- **Customer history** — lifetime paid value, order/quote history, communications, and automatic duplicate detection (by normalized email) with a merge path.
- **Companies** — parent-account profiles for B2B customers with multiple contacts (CC email support).
- **Portal customer management** — invite, manage, and re-invite customer-portal accounts (separate identity from the CRM's own `customers` table — see [Data Model](#data-model--what-we-track)).
- **Loyalty tiers** (Bronze/Silver/Gold, see [Loyalty Program](#loyalty-program-cl86f1)) tracked per customer, driving discount codes, perks, and priority mockups automatically.

### 📊 Reporting & Analytics (core strength)
A dedicated **Reports** page with date-range filtering across **8+ analytical modules**:

| Module | What it answers |
|--------|-----------------|
| **Sales Report** | Gross vs. net revenue, refunds/cancellations, amount collected vs. pending, AOV, daily revenue trend, **per-agent performance & commission** (with payment-recovery breakdown), and **repeat-customer** metrics (repeat rate, repeat revenue, top customers) |
| **Profit & Loss** | Revenue vs. total cost vs. net profit, cost-breakdown donut (production/shipping/marketing), production cost by patch type, and a **paginated Loss Alerts table** flagging orders sold below cost |
| **Income Statement** | Industry-standard P&L: Gross Revenue → less cancellations/refunds → Net Revenue → COGS → Gross Profit → operating expenses (from monthly costs) → **Net Profit**, with gross & net margins |
| **Cancellation & Refund** | Lost revenue and reason-category breakdown for cancelled and refunded orders |
| **Product Mix** | Revenue, cost, and profit margin by patch type and by quantity band (1–50, 51–100, 101–200, 200+) |
| **Lead Source Distribution** | Lead volume by channel (from quotes), grouped into categories (Search, Social, Paid Ads, AI/LLM, Referral, …) |
| **Funnel & Attribution** | Quote→order conversion rate, agents bypassing the quote flow, and **Meta CAPI data-quality** breakdown (tracked / partial / untracked revenue) |
| **Customer & Form Feedback** | Satisfaction ratings (1–5★) from order notes, and ease-of-use ratings from website quote forms |
| **Loyalty Stats** | Per-tier customer count, lifetime value, code redemption rate, and reorder rate |

Charts are built with **Recharts**; every report supports **CSV export**.

### Financials & Cost Tracking
- **Bulk Cost Entry** — enter production, shipping, and marketing cost per order for any month, with live per-order **profit** and **margin** calculation.
- **Per-order P&L** — `profit = order amount − (production + shipping + marketing cost)`, surfaced throughout reports.
- **Monthly operating expenses** — rent, salaries/commission, utilities, etc., feeding the Income Statement.
- **Payment integrity is entirely server-side**: no client ever writes `amount_paid`/`payment_status` directly — see [Payment Integrations](#payment-integrations) and [Idempotency](#idempotency-is-layered-not-a-single-point).

### Attendance & Timesheets
- **Clock in/out** with live shift tracking, daily/weekly/monthly hours, overtime/undertime classification, and **CSV export** (timezone-aware, 5 AM Pakistan-time shift boundary).
- Admin tools to review records and force-close stale sessions; a Postgres `pg_cron` job auto-closes sessions left open beyond the max shift, with a client-side fallback.

### Messaging, Activity & Payments
- **Inbox** — internal and customer conversations, plus live Meta Messenger/Instagram chat threads (see [Meta Chat](#meta-chat)), with real-time updates.
- **Activity log** — system-wide audit feed of user actions.
- **Payment forms** — agent-generated public payment links (`/pay/:token`) backed by **Square Checkout**, now capturing the same field set as the full Order Form (CC email, PO#, company, border type, sample box, country, urgent + ship-by).

### Marketing & Attribution
- **Lead source** on every order/quote, plus 5-country shipping/tax tracking (USA, Australia, Canada, New Zealand, UK).
- **Meta Conversions API (CAPI)** — server-side Purchase & Lead/InitiateCheckout events, automatic reversal on refund/cancel, and a webhook receiver for Messenger/Instagram — see [Meta CAPI & Marketing Automation](#meta-capi--marketing-automation).
- **Google Ads** — quote-to-lead and quote-to-order conversion hooks exist but currently log a `SKIPPED` audit row rather than uploading (the legacy API path was deprecated 2026-06-15; see that section for the replacement plan).
- **UTM / Click-ID capture** (fbclid/fbp, gclid/gbraid/wbraid, msclkid, ttclid) flowing from website checkout and Payment Form links into orders, with an automatic **attribution-recovery** trigger that backfills missing click data from the same customer's recent quotes/checkout attempts/payment-form tokens.

### Loyalty Program (CL86F1)
Automatic, lifetime-spend-based tiers with real-time and nightly-reconciled award logic. See [full section below](#loyalty-program-cl86f1).

### Review Generation (MASTER v3)
A daily cron sends a personal (non-templated, plain-text) review-invite email a few days after delivery, with one follow-up reminder — never gated on satisfaction, per Trustpilot/FTC compliance. See [Automations](#every-automation-in-the-system).

### Email Automation
Transactional email via **ZeptoMail (Zoho)** through the single `send-email` Edge Function — every customer and internal milestone renders through one HTML template builder. See the [full trigger table](#every-email-template--what-fires-it) — it's large enough to deserve its own section.

### Users, Roles & Permissions (RBAC)
**4 roles**, refined by **11 granular permission toggles** per user.

| Role | Typical access |
|------|----------------|
| **ADMIN** | Everything — financials, reports, user management, settings, cost entry |
| **SALES_AGENT** | Orders, quotes, customers (own or all, by permission) |
| **PRODUCTION** | Production details, status changes, files — no financials (enforced at the database, not just the UI — see [Production Never Sees Payment Info](#production-never-sees-payment-info)) |
| **SHIPPING** | Shipping-stage fields (tracking, carrier, shipping docs) |

Granular permissions: `users_manage`, `orders_create`, `orders_view_all`, `orders_view_own_only`, `orders_change_status`, `orders_edit_financials`, `orders_edit_production`, `orders_delete`, `reports_view_financials`, `shipping_view`, `attendance_clock_only` (kiosk mode).

### Settings & Search
- **Settings** — business logo, company config, password change, Meta connection panel, and orphaned-file storage cleanup.
- **Global search** across orders, customers, and quotes (unconverted quotes included as of the 2026-08-28 fix — see [Automations](#every-automation-in-the-system)).

---

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
  /clock-in-out                   Attendance / timesheets
  /settings                       Business settings

ADMIN ONLY
  /bulk-cost-entry                Monthly cost entry & operating expenses
  /bulk-close-orders              Bulk-mark stale orders DELIVERED
  /user-management                Staff accounts, roles, permissions
  /performance-metrics            App performance monitoring (APM)
  /portal-customers               Customer portal account management
  /companies                      Company / parent-account profiles
```

---

## Architecture

### Frontend
- **React 18** + **TypeScript 5** (strict) — fully typed codebase
- **Vite 5** — fast HMR, code-split production builds (pages lazy-loaded)
- **Tailwind CSS 3** — custom brand design system + dark mode
- **TanStack Query 5** — server-state caching, background sync, pagination
- **React Router 6** — nested + protected routes (`ProtectedRoute`, `AdminRoute`, `HostnameRouter`)
- **React Hook Form 7** + **Zod** — performant, validated forms
- **Recharts** (analytics), **Framer Motion** (animation), **Lucide** (icons)
- **@react-pdf/renderer** (invoices/PDFs), **react-csv** (exports), **react-window** (virtualized lists)

### Backend — Supabase
- **PostgreSQL** with migrations, indexes, and constraints — plus a substantial layer of triggers/functions/cron jobs applied directly against the live database that aren't all captured as migration files (the live schema is the source of truth; see [Data Model](#data-model--what-we-track) and [Automations](#every-automation-in-the-system))
- **Row-Level Security (RLS)** on every table — staff see all, customers see only their own data (enforced at the database, not just the app)
- **Supabase Auth** — email + password, invite links, password recovery
- **Supabase Storage** — private buckets with signed URLs for mockups, production files, attachments (order-attachment images are in a public bucket so they render inside transactional emails)
- **Supabase Realtime** — live order/attendance/messaging updates pushed to all connected staff
- **25 Edge Functions (Deno)** — see below
- **`pg_cron` + `pg_net`** — scheduled jobs that call Edge Functions directly from Postgres (see [Cron Jobs](#cron-jobs))

### Supabase Edge Functions (25)
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
Google Ads        google-ads-conversions (DB webhook; currently a logged no-op —
                  see Automations)
Loyalty           validate-loyalty-code · loyalty-status · loyalty-email-cron
Reviews           review-invite-cron
```

Only 4 of these 25 (`square-payment-webhook`, `create-square-checkout`, `create-square-payment-link`, `send-meta-lead-event`) have been migrated to the Deno-native `jsr:@supabase/supabase-js@2` import; the rest still use `esm.sh`, which is the exact import path that caused a ~2-day outage on `square-payment-webhook` in August 2026 (the `esm.sh` build bundles Node's `ws` package, which crashes on cold boot in the edge runtime). Worth migrating opportunistically whenever one of the other 21 is touched.

### Vercel Serverless (`/api`)
- **`sentry-proxy.ts`** — tunnels Sentry events through first-party domain (bypasses ad blockers), validating project ID/host before relaying.

### Infrastructure
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

## Order Lifecycle

`OrderStatus` (`src/types/index.ts`) — the database column `orders.status` is plain `text`, not a Postgres enum, so ordering/validity is enforced only at the application layer plus a handful of guard triggers.

| Status | What it means / what moves an order into it |
|---|---|
| `PENDING_PAYMENT` | Held "wait for payment" order (Add Order / Re-order flow with a deposit not yet collected). Excluded from the production queue and from all creation emails. Released to `NEW_ORDER` automatically — by `apply_order_payment()` — the moment **any** payment lands via Square. |
| `NEW_ORDER` | Default at creation for every normal flow; also the release target from `PENDING_PAYMENT`. A trigger forces any inserted status of `''`/null/`PAID`/`CONFIRMED` to `NEW_ORDER` so a bad value can never sneak in. |
| `REVISION_REQUESTED` | Agent sets this after the customer asks for mockup changes. 3+ revision loops on one order raise an admin notification. |
| `AWAITING_CUSTOMER_APPROVAL` | Set when a mockup is sent for approval (only reachable from `NEW_ORDER`/`REVISION_REQUESTED`). Fires the Meta CAPI **Lead** event. |
| `APPROVED` | Customer approves the mockup. Treated identically to `IN_PRODUCTION` for email/CAPI purposes. |
| `IN_PRODUCTION` | Production begins. Fires the Meta CAPI **InitiateCheckout** event. |
| `QUALITY_ASSURANCE` | Pre-ship QA check. |
| `REMAKE` | Order needs a redo (quality/handling/lost-in-transit/force majeure — the customer-facing wording adapts to the reason). Clears any existing production-complete stamp automatically. |
| `COMPLETED` | Terminal-ish general completion status. |
| `SHIPPED` | Tracking number/carrier captured — see [tracking-number handling](#a-note-on-tracking-numbers) below. |
| `CANCELLED` | Terminal. Triggers a Meta CAPI Purchase **reversal** if a Purchase was previously sent for this order. |
| `DELIVERED` | Stamps `delivered_at` automatically on first transition (or via the admin-only bulk-close tool, which can mark it estimated). Starts the review-invite clock. |
| `REFUNDED` | Terminal, same CAPI-reversal treatment as `CANCELLED`. |
| `FEEDBACK` | Feedback-request stage (also counted alongside `DELIVERED` as review-eligible). |

A handful of DB-level guard triggers back these rules up so they hold even if a bug or a direct SQL edit tries to bypass the UI: once `payment_status='paid'`, it can never be silently un-set except by moving into `CANCELLED`/`REFUNDED`; and a production-only/non-financial user's UPDATE has money fields stripped and status changes blocked server-side, not just hidden in the UI.

### A note on tracking numbers
The `SHIPPED` email only renders the Tracking Information box when `shippingTrackingNumber` is present **on the same save that sets status to `SHIPPED`** (both fields live in the same order-edit form and are submitted together). If a tracking number is added in a **later, separate edit** — after the order is already `SHIPPED` — no email fires again, because the status doesn't change a second time, and there's no other mechanism that re-notifies the customer. Worth knowing operationally: enter tracking before or at the same time as marking an order shipped, not after.

---

## Data Model — What We Track

The live schema is considerably larger than what's captured in `supabase/migrations/` (39 tracked migration files) — quite a few tables, columns, and Postgres functions were added directly against the live database and aren't reflected as migration files. The list below reflects the **live** schema, grouped by concern.

### Orders, quotes & payments
| Table | Purpose | Notable columns |
|---|---|---|
| `orders` | The master order record | `status` (free text, see [lifecycle](#order-lifecycle)), `payment_status`/`paid_at`/`balance_due`, `is_web_checkout`, `is_reorder`, `deleted_at` (soft delete), `attribution` (jsonb) + `attribution_quality` (generated: tracked/partial/untracked), `capi_purchase_sent*` + `capi_lead_events` (Meta CAPI idempotency/log), `loyalty_code_used`/`loyalty_discount_percent`, `priority_mockup`, `converted_from_quote_id`/`_number`/`had_prior_quote_request` (quote lineage), `legacy_customer_ref`, `ship_city`/`ship_state`/`ship_postal` (structured geo, separate from the free-text `shipping_address`), plus the idempotency-guard columns listed under [Idempotency](#idempotency-is-layered-not-a-single-point) |
| `quotes` | Pre-order estimate / lead capture | `converted_at`/`converted_order_id` (marked converted, never deleted, when paid via a quote payment link), `is_duplicate` (auto-flagged if the same email quoted within 48h), `meta_psid`/`meta_ig_id`/`meta_channel`/`meta_ad_id`/`meta_ctwa_clid` (Messenger/Instagram chat→quote linkage) |
| `payment_form_tokens` | Staging table for agent-generated "Payment Form" links | `token` (the Square `reference_id`), `deposit_amount`/`is_deposit`, `expires_at` (7 days), `used_at`/`order_id`/`order_number` once converted, `customer_attachment_urls` (customer-supplied reference images — kept separate from internal `mockup_urls`) |
| `square_pending_orders` | Staging table for website "Buy Now" checkout | `token`, `order_data` (jsonb cart snapshot), `consumed_at` (atomic claim — also raced against a separate, non-CRM process that watches this same table) |
| `square_processed_payments` | Payment-level idempotency ledger | `payment_id` (unique) — the real guard against duplicate order creation across Square's multiple webhook deliveries per payment |
| `square_webhook_events` | Event-level dedup | `event_id`, `event_type` — catches literal webhook retries of the same delivery (a weaker, first-layer guard than the payment-level one above) |
| `order_history` | Full audit trail of order field changes | Written automatically by a trigger on plain column changes, and manually by RPCs/edge functions for events that aren't (creation, deletion, payment corrections, manual payments) |
| `order_communications` | Per-order email send log | `template_id`, `visibility` (internal/customer) — backs the Email Logs UI and the resend-failed-email feature |
| `order_notes` | Internal sales notes / quality feedback / complaints | Optional 1–5★ rating |
| `checkout_attempts` | Abandoned-cart capture from the website's own checkout | `email_sent_at`/`email_2_sent_at` imply an abandoned-cart email sequence living in the website's own codebase, not this one; can promote into a CRM lead/quote |

### Customers & staff
| Table | Purpose |
|---|---|
| `customers` | The CRM's own customer master record, deduped by normalized email — carries `lifetime_paid_value`, `loyalty_tier`, tier-achieved timestamps, and `merged_into_id` for dedup/merge |
| `customer_profiles` | The customer **portal** identity (distinct from `customers` above — 1:1 with the portal's own `auth.users`) |
| `user_profiles` | Internal staff accounts — `role` + granular `permissions` jsonb (this jsonb is what actually enforces "production can't touch money," not just a UI toggle) |
| `customer_flags` | Ad-hoc `is_premium` flag per customer, admin-set |
| `customer_privacy_optouts` | Erasure/suppression registry — currently checked by the **review-invite cron only**; the loyalty cron does not consult it, which is worth a look if global marketing suppression is expected to cover loyalty emails too |
| `activity_notifications` | In-app bell notifications to staff | 
| `customer_notifications` | The customer-portal equivalent, keyed by customer email |

### Loyalty program (CL86F1)
| Table | Purpose |
|---|---|
| `loyalty_codes` | One row per awarded code — tier, percent, `single_use` (Bronze only), `expires_at` (Bronze: 90 days), `status` (active/redeemed/revoked), send/redemption timestamps |
| `loyalty_rush_upgrades` | Gold's one-free-rush-upgrade-per-quarter perk ledger |
| `loyalty_admin_audit` | Audit log of any admin override (grant/revoke/reissue) — a `reason` is mandatory |

### Review generation (MASTER v3)
| Table | Purpose |
|---|---|
| `review_invitations` | One row per order — invite/reminder sent timestamps, status |

### Meta chat
| Table | Purpose |
|---|---|
| `conversations` | Messenger/Instagram thread state — assignee, unread count, and `promoted_quote_id`/`promoted_to_order_id` (chat→quote→order promotion lineage) |
| `meta_messages` | Individual inbound/outbound messages, deduped on Meta's own message id, with the 24-hour-window message tag Meta requires for late replies |

### Google Ads (Data Manager migration in progress)
`google_ads_upload_log` (now records `SKIPPED` rows, see [Automations](#every-automation-in-the-system)), plus several `google_ads_data_manager_export*`/`_crm*`/`_customers`/`_leads` tables/views feeding a Google Sheets-based replacement for the deprecated upload API — this replacement is configuration, not code, and per the function's own comments isn't fully wired in yet.

### Other
`monthly_costs` (operating expenses by category), `attendance_sessions`/`attendance_summary` (clock in/out), `performance_metrics`, `form_feedback` (quote-form UX ratings). Two tables/columns exist but appear unused by any code in this repo: `orders.paypal_order_id`/`paypal_capture_id` + a `paypal_pending_orders` table (no PayPal edge function exists here — confirm with the team before treating this as active), and an `email_templates` registry table (the real templates are hardcoded in `send-email`'s TypeScript, not read from this table).

---

## Every Automation in the System

This is the part of the app with no UI — it runs whether or not anyone is looking. Roughly three kinds: **Postgres triggers** (fire on a database write), **Supabase Edge Functions** (HTTP-callable, or invoked BY a trigger/cron), and **cron jobs** (`pg_cron` on a schedule).

### The 5 order-creation paths
Every order ultimately comes from one of these, and each sets `sales_agent`/`attribution` differently — which matters because several automations key off exactly those two fields:

1. **Staff-created (CRM UI)** — `sales_agent` = the logged-in staff email. Immediate confirmation + internal emails unless the agent explicitly picks the held `PENDING_PAYMENT` state (Add Order / Re-order "wait for payment"). Synchronously provisions the customer's portal account so the invite link can ride along in the same confirmation email.
2. **Payment Form (agent-generated pay link)** — `sales_agent` = the agent who built the link; `attribution.source = 'square_payment_form'`. Created already paid, never held.
3. **Website "Buy Now" checkout** — `sales_agent = 'WEB_CHECKOUT'`; `attribution.source = 'square_checkout'`. Portal provisioning is intentionally NOT done here — the website's own account flow owns it.
4. **Existing-order balance payment** — doesn't create an order; applies a payment to one that already exists (including releasing a held `PENDING_PAYMENT` order once its deposit/balance lands).
5. **Quote paid via its own Square link** — `sales_agent` = whatever the quote already had (often `WEBSITE_BOT` for auto-captured leads). Created already paid; the source quote is marked converted, never deleted.

All 5 share one Edge Function, `square-payment-webhook`, which is why its idempotency has to work at two levels simultaneously (see [Idempotency](#idempotency-is-layered-not-a-single-point)).

### Every email template & what fires it

| Template | Fired by | To | Guard |
|---|---|---|---|
| `CUSTOMER_NEW_ORDER` | Staff-created order (path 1 above) | customer | fires once, at creation |
| `INTERNAL_NEW_ORDER` | **Three mutually-exclusive triggers** (fixed 2026-08-28 after a real duplicate — see below) | production team | `production_notified_at` claim; PVC patch type → nothing sent |
| `CUSTOMER_MOCKUP_READY` | Status → `AWAITING_CUSTOMER_APPROVAL` | customer | — |
| `CUSTOMER_REVISION_IN_PROGRESS` / `PRODUCTION_TEAM_REVISION` | Status → `REVISION_REQUESTED` | customer / production | PVC suppresses the internal copy |
| `CUSTOMER_PRODUCTION_STARTED` / `INTERNAL_START_PRODUCTION` | Status → `IN_PRODUCTION`/`APPROVED` | customer / production | PVC suppresses the internal copy |
| `QUALITY_ASSURANCE` | Status → `QUALITY_ASSURANCE` | customer (worth double-checking with the team — the template id sounds internal, but the code sends it to the customer) | — |
| `CUSTOMER_SHIPPED` | Status → `SHIPPED` | customer | see [tracking-number note](#a-note-on-tracking-numbers) |
| `CUSTOMER_DELIVERED` | Status → `DELIVERED` | customer | — |
| `CUSTOMER_FEEDBACK_REQUEST` | Status → `FEEDBACK` | customer | — |
| `CUSTOMER_REFUND_ISSUED` | Status → `REFUNDED` | customer | — |
| `CUSTOMER_REMAKE` / `INTERNAL_REMAKE` | Status → `REMAKE` | customer / production + sales agent | PVC suppresses the internal copy |
| `INTERNAL_PRODUCTION_COMPLETE` | Production marks an order production-complete | `hello@pandapatches.com` (fixed; **not** PVC-gated) | — |
| `CUSTOMER_PAYMENT_CONFIRMATION` | Any Square payment landing (all 5 creation paths, plus balance payments) | customer | **two** independent one-shot guards — one for "confirmed," one for "paid in full" (the PAID invoice PDF only attaches once the second fires); consolidated into one email even when both fire at once |
| `INTERNAL_PAYMENT_NOTIFICATION` | Manual "record payment" action only | `lance@pandapatches.com` fixed | — |
| `WEBSITE_AUTH_ORDER_ACCOUNT` | New customer's first portal-account provisioning | customer | `invite_sent_at` per-order claim |
| `CUSTOMER_RETURNING_LOGIN` / `CUSTOMER_PASSWORD_RESET` | Returning customer login / password reset | customer | — |
| `AGENT_NEW_CUSTOMER_MESSAGE` / `CUSTOMER_NEW_AGENT_MESSAGE` | Order message thread reply | agent+admins / customer | — |
| `CUSTOMER_REVIEW_INVITE` / `CUSTOMER_REVIEW_REMINDER` | Daily review-invite cron | customer | claimed via `review_invitations`; reminder sent once, 5+ days after invite; skips anyone in `customer_privacy_optouts` |
| `LOYALTY_BRONZE_AWARDED` / `LOYALTY_SILVER_AWARDED` | Daily loyalty cron, on tier-up | customer | claimed on the `loyalty_codes` row before send |
| `LOYALTY_GOLD_DRAFT` | Daily loyalty cron, on Gold tier-up | drafted to Imran's inbox for a personal one-click send — never auto-sent to the customer | same claim as above |
| `LOYALTY_BRONZE_EXPIRY` | Daily loyalty cron | customer | reminder claim + a 14-day global send cap |
| `LOYALTY_NEAR_THRESHOLD` | Daily loyalty cron | customer | quarterly + 14-day caps; skipped if a `REMAKE` opened in the last 30 days |

**The `INTERNAL_NEW_ORDER` duplicate, and why it's now three mutually-exclusive paths, not two overlapping ones:** as of 2026-08-28, this template is fired from exactly three places, gated so only one ever fires for a given order — the CRM-UI creation path (path 1 above) sends it directly; a separate **database webhook** (fires on every `orders` insert/update, not called from any app code) sends it for website-checkout and Payment-Form orders once the order is complete enough for production (patch type + backing + size + at least one image), claimed atomically so concurrent webhook retries can't double-send; and the quote-payment webhook path sends it directly for quote-paid orders, since those never match the database webhook's own gating conditions. A same-day fix removed a genuine duplicate (order PP-11361 got two internal emails) caused by adding a redundant send inside the webhook for cases the database webhook already covered.

### Cron jobs
| Job | Schedule | What it does |
|---|---|---|
| `review-invite-cron` | Daily, 15:00 UTC | Sends the personal review-invite + single reminder (see [Review Generation](#review-generation-master-v3)) |
| `loyalty-email-cron` | Daily, 16:00 UTC | Sends all loyalty tier/expiry/nudge emails |
| Nightly loyalty reconciliation | Daily, 07:00 UTC | Recomputes every active customer's tier from scratch as a backstop to the real-time trigger below — catches anything the trigger missed |
| Stale attendance auto-close | — | Force-closes clock-in sessions left open past the max shift |

### Meta CAPI & marketing automation
- **Purchase** — fires once per order, on the **first** payment (deposit or full), sending the **full order amount** as the event value regardless of how much was actually collected at that moment (a deliberate, confirmed policy for 10–30-day custom-production orders — see [below](#deposit-fires-the-full-meta-purchase-value)). Reversed automatically (a negative-value correction using the same event id) if the order is later cancelled or refunded.
- **Lead** — fires when a mockup is sent for approval. **InitiateCheckout** — fires when production starts. Both correctly omit `value`/`currency` entirely when there's no real positive order amount (fixed 2026-08-28 — they used to send a malformed `value: 0`, which Meta counts as a genuine zero-value event and quietly drags down reported average order value).
- **Google Ads** — hooks exist on quote creation and quote-to-order conversion, but as of the account's 2026-06-15 deprecation from the legacy conversion-upload API, the function computes what it *would* send and logs a `SKIPPED` row instead of calling Google. The replacement (a Google Data Manager Sheets export) is configuration work, not code, and isn't fully wired in yet.
- **Meta chat webhook** — receives Messenger/Instagram DMs, fires a Lead event for a brand-new conversation, and raises an in-app notification for the assigned agent (or all admins, if unassigned).

### Loyalty Program (CL86F1)
Tier codes are `PANDA-{TIER}-XXXXXX`, based on **lifetime paid value** (computed from confirmed payments only — cancelled/refunded/held/soft-deleted orders never count):

| Tier | Threshold | Perks |
|---|---|---|
| Bronze | $1,000 | 5% code, single-use, expires in 90 days |
| Silver | $5,000 | 5% code, free Velcro backing, priority mockup queue, no expiry |
| Gold | $10,000 | 10% code, one free rush upgrade per quarter, personal outreach (drafted, not auto-sent) |

Tiers only ever go **up automatically** — a real-time trigger recomputes on every payment/status change, and a nightly cron sweep re-checks every active customer as a backstop. Admin overrides (grant/revoke/reissue) are separately audited and require a reason. The website's checkout validates a code server-to-server before applying it, and restricts loyalty discounts to calculator-priced orders only — never stacked on top of a custom quote.

### Idempotency is layered, not a single point
Because Square can (and does) deliver multiple `payment.updated` events for one payment, and a database webhook can fire multiple times for one row update, nothing in this system relies on a single guard. The layers, from broadest to narrowest:
1. **Event-id dedup** (`square_webhook_events`) — catches a literal repeated webhook delivery.
2. **Payment-id claim** (`square_processed_payments`) — the real guard against creating the same order twice across Square's several deliveries per payment.
3. **Per-flow claims** — a payment-form token's `used_at`, a pending-checkout row's `consumed_at`, and a handful of one-shot timestamp columns on `orders` itself (`production_notified_at`, `customer_confirmation_sent_at`, `paid_invoice_sent_at`, `invite_sent_at`) — each independently claimed with an atomic conditional UPDATE before anything is sent, so a concurrent retry always loses the race and skips rather than double-sending.

### Production never sees payment info
Enforced in three independent places, not just one: a database trigger strips every money-related column from any update made by a production-only/non-financial user and blocks them from changing order status at all; the order-detail page's financials section is separately gated in the UI on an admin/financial-viewer permission; and the "production complete" internal email is built from a hand-picked, money-free payload rather than reusing the general email-data builder, so a future field added to that builder can't accidentally leak a dollar figure into it.

### Deposit fires the full Meta Purchase value
A confirmed, deliberate policy: when a customer pays a deposit, the Purchase event sent to Meta still reports the **full order total**, not the deposit amount, tagged internally with whether it was a deposit or a full payment at the time. The reasoning: for custom 10–30-day production orders, a deposit is a strong enough purchase-intent signal that under-reporting it as a partial value would distort Meta's optimization more than reporting it in full. This has been raised to and confirmed by ownership; it isn't an oversight.

### PVC is the one patch type with no internal emails
Since a 2026-07 vendor change, `PVC` orders send **zero** internal notification emails at any stage (new order, revision, production start, remake) — customer-facing emails are completely unaffected. This is intentional (PVC orders are routed to a vendor manually, so an automated production-team email would just be noise) but worth knowing if a "missing" internal email ever gets reported for a PVC order.

---

## Getting Started (Local Development)

### Prerequisites
- **Node.js 20.x** (pinned in `package.json` → `engines`)
- A Supabase project (URL + anon key)

### Setup
```bash
# 1. Install dependencies
npm install

# 2. Create a local .env (this file is gitignored — never commit it)
#    Values are public, frontend-safe VITE_ vars (anon key is protected by RLS).
cat > .env <<'EOF'
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_CRM_BASE_URL=http://localhost:5173/
EOF

# 3. Start the dev server (http://localhost:5173)
npm run dev
```

### Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the Vitest unit suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` — must be clean (0 errors) |

---

## Testing & Quality Gates

- **Runner:** [Vitest](https://vitest.dev) (jsdom).
- **High-value unit suites** cover the business-critical pure logic:
  - `src/utils/leadSource.test.ts` — attribution precedence (ad → click-id → UTM → referrer → Direct), the "Checkout is a channel, not a source" invariant, `/ Checkout` display.
  - `src/utils/patchVocab.test.ts` — order-form dropdown normalization (PVC / iron-on / aliases / passthrough).
  - `src/utils/fetchAllPaged.test.ts` — pagination never silently truncates past PostgREST's 1000-row cap (the same bug class that once hid older quotes from the Quotes page — fixed 2026-08-28 by paging through in batches instead of relying on a single oversized `.limit()`, which PostgREST silently caps regardless of the number requested).
- **Type safety:** `tsc --noEmit` is clean (**0 errors**) and enforced as a gate.
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm test` (blocking) + `npm run typecheck` (informational) on every push / PR to `main`.
- **Remediation tracker:** see [`AUDIT_REMEDIATION.md`](AUDIT_REMEDIATION.md) for the full audit-fix status (done / pending / deploy checklist).

---

## Environment Variables

> The `.env` file is **gitignored**. Frontend `VITE_` values are public by design (the Supabase **anon** key is safe to expose — data is protected by RLS). Server-side secrets live only in the **Vercel** and **Supabase** dashboards, never in the repo.

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Frontend / Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend / Vercel | Public client auth key (RLS-protected) |
| `VITE_CRM_BASE_URL` | Frontend / Vercel | App base URL (links, redirects) |
| `SENTRY_PROJECT_ID`, `SENTRY_HOST` | Vercel | Validate/relay events in `api/sentry-proxy.ts` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | Admin operations inside Edge Functions |
| `ZEPTOMAIL_API_KEY` | Supabase secret | Transactional email delivery |
| `BILLING_FROM_EMAIL` | Supabase secret | From-address override for the PAID-invoice email once `billing@pandapatches.com` is verified (defaults to `hello@pandapatches.com`) |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | Supabase secrets | Square Checkout + webhook HMAC verification |
| `META_ACCESS_TOKEN`, `META_TEST_EVENT_CODE` | Supabase secrets | Meta CAPI sends |
| `LOYALTY_VALIDATE_SECRET` | Supabase secret | Shared-secret auth for the website's server-to-server loyalty calls |
| Cron secret header | Supabase secret | Authenticates `review-invite-cron`/`loyalty-email-cron` invocations |

---

## Deployment

- **Frontend** auto-deploys to **Vercel** on every push to `main`. SPA routing, asset caching, and the Sentry proxy rewrite are configured in [`vercel.json`](vercel.json). Set the Vercel project's **Node.js version to 20.x** to match `engines`.
- **Backend** runs on **Supabase Cloud** — apply migrations and deploy Edge Functions with the Supabase CLI:
  ```bash
  supabase db push                 # apply migrations
  supabase functions deploy        # deploy edge functions
  ```
  In practice, schema and edge-function changes during active development are often applied directly via the Supabase MCP/dashboard rather than round-tripped through a local migration file first — when that happens, back-fill a migration file afterward so `supabase/migrations/` doesn't drift further from the live schema.

---

## Security

- **Row-Level Security** on every table — access enforced at the database layer
- **Granular per-user permissions** enforced in both the app and the database (see [Production Never Sees Payment Info](#production-never-sees-payment-info) for a concrete example)
- **Admin-gated user management** — `create-user` / `update-user` / `get-users` / `delete-user` verify the caller is an admin server-side (JWT → role check) before any privileged action
- **Server-side payment integrity** — payments only ever move through `apply_order_payment()` (row lock + atomic increment, called from the Square webhook) or the manual `record_manual_payment()` RPC (over-payment guard, fully audited); clients never write `amount_paid`/`payment_status` directly, and a guard trigger refuses to let any UPDATE silently un-set a `paid` status
- **Invite-link / recovery-link auth** — no plaintext passwords in email
- **Idempotent webhooks** (Square event + payment dedup, HMAC-verified — see [Idempotency](#idempotency-is-layered-not-a-single-point)) and **CAPI reversal** on refunds
- **Sentry proxy tunnel** keeps error reporting first-party and resilient to blockers
- **React** auto-escaping; thorough HTML-escaping in transactional email; inputs normalized (empty → `NULL`) before writes
- **Storage note:** order-attachment images live in a **public** bucket (so they render inside transactional emails); non-public artifacts should continue to use signed URLs. See [`AUDIT_REMEDIATION.md`](AUDIT_REMEDIATION.md) for the open financial-column-masking item.

---

## By the Numbers

| | |
|---|---|
| Pages / routes | 25 |
| Reporting modules | 8+ |
| Supabase Edge Functions | 25 |
| Order statuses | 14 |
| User roles · permissions | 4 · 11 |
| Tracked migration files | 39 (live schema has additional untracked changes — see [Data Model](#data-model--what-we-track)) |
| Integrations | Supabase · ZeptoMail · Meta CAPI · Square · Google Ads · Sentry · Vercel |

---

## Tech Stack Summary

```
Frontend       React 18 · TypeScript 5 · Vite 5
Styling        Tailwind CSS 3 · Framer Motion
State / Data   TanStack Query 5 · React Context
Routing        React Router 6
Forms          React Hook Form 7 · Zod
Charts         Recharts          PDFs   @react-pdf/renderer
Database       PostgreSQL (Supabase) · RLS · migrations + live triggers/functions
Auth           Supabase Auth (email+password, invite links)
Storage        Supabase Storage (private buckets, signed URLs)
Realtime       Supabase Realtime (WebSocket subscriptions)
Serverless     Supabase Edge Functions (Deno) · pg_cron · Vercel Functions (Node)
Email          ZeptoMail (Zoho)
Payments       Square (Stripe fully decommissioned; PayPal columns exist but unused)
Marketing      Meta CAPI · Google Ads (conversion upload deprecated, replacement pending) · UTM/Click-ID attribution
Monitoring     Sentry · Vercel Analytics · Speed Insights
Hosting        Vercel (frontend) · Supabase Cloud (backend)
```

---

<div align="center">

**Built for Panda Patches · Running in production.**

*React · TypeScript · Supabase · Tailwind CSS · Vercel*

</div>
