<div align="center">

# Panda Patches — CRM & Order Management System

**Production-grade · Full-Stack · Custom Manufacturing Operations Platform**

[![React](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=flat&logo=vite&logoColor=white)](https://vite.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)](https://vercel.com)

**The internal operating system that runs the Panda Patches business — leads, quotes, orders, production, fulfillment, payments, financial reporting, and team management, all in one place.**

</div>

---

## What Is This?

This is the **staff-facing CRM and order-management dashboard** for Panda Patches, a custom manufacturing business (patches, apparel, branded merchandise). It runs the full operational lifecycle: a lead comes in, becomes a quote, converts to an order, moves through production and QA, ships, gets paid, and feeds into financial reporting — all tracked in one application with real-time updates across the team.

It's a React + TypeScript single-page app backed by Supabase (PostgreSQL, Auth, Storage, Realtime, and Edge Functions), deployed on Vercel.

> **Scope note:** The **customer-facing portal** (customer login, order tracking, file downloads) now lives on the marketing website. This repository is the **internal staff CRM** plus the shared serverless backend (Supabase Edge Functions) and the public **agent-generated payment links** (`/pay/:token`).

---

## Feature Overview

### Orders & Quotes
- **Full order lifecycle** across 13 statuses (`NEW_ORDER` → `IN_PRODUCTION` → `QUALITY_ASSURANCE` → `SHIPPED` → `DELIVERED`, plus `REMAKE`, `CANCELLED`, `REFUNDED`, `FEEDBACK`).
- **Order detail** with status timeline, full change history (every field change logged with user + timestamp), communications log, internal notes, and file attachments (mockups, production files, customer attachments, shipping docs).
- **Quotes** with one-click **convert-to-order** — customer details, design specs, pricing, and marketing attribution all carry over.
- **Order assignment** — admins assign orders to sales agents (`assigned_by` / `assigned_at`), with an unassigned queue and per-agent workload view.
- **Bulk actions**, server-side pagination/filtering, global search, and quick-view drawer.

### Customers & Companies
- **Customer history** — lifetime value, order/quote history, communications, and automatic duplicate detection per customer.
- **Companies** — parent-account profiles for B2B customers with multiple contacts (CC email support).
- **Portal customer management** — invite, manage, and re-invite customer-portal accounts.

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

Charts are built with **Recharts**; every report supports **CSV export**.

### Financials & Cost Tracking
- **Bulk Cost Entry** — enter production, shipping, and marketing cost per order for any month, with live per-order **profit** and **margin** calculation.
- **Per-order P&L** — `profit = order amount − (production + shipping + marketing cost)`, surfaced throughout reports.
- **Monthly operating expenses** — rent, salaries/commission, utilities, etc., feeding the Income Statement.

### Attendance & Timesheets
- **Clock in/out** with live shift tracking, daily/weekly/monthly hours, overtime/undertime classification, and **CSV export** (timezone-aware).
- Admin tools to review records and force-close stale sessions; a Postgres `pg_cron` job (`auto_close_stale_sessions`) auto-closes sessions left open beyond the max shift, with a client-side fallback.

### Messaging, Activity & Payments
- **Inbox** — internal and customer conversations with real-time updates.
- **Activity log** — system-wide audit feed of user actions.
- **Payment forms** — agent-generated public payment links (`/pay/:token`) backed by **Square checkout**, plus **Stripe** balance/payout webhooks.

### Marketing & Attribution
- **Lead source** on every order/quote, plus 5-country tracking (USA, Australia, Canada, New Zealand, UK).
- **Meta Conversions API (CAPI)** — server-side purchase & lead events, reversal on refund, and a webhook receiver, with attribution quality scoring (`tracked` / `partial` / `untracked`).
- **Meta Messenger / Instagram** chat metadata captured on quotes (PSID, IG ID, ad/creative IDs, click-to-WhatsApp).
- **UTM / Click-ID capture** (fbclid/fbp, gclid) flowing from website checkout into orders.

### Email Automation
Transactional email via **ZeptoMail (Zoho)** through the `send-email` Edge Function — templates for every milestone (new order, mockup ready, production started, shipped, delivered, feedback request, refund, customer invite/welcome, returning-login, password reset, plus internal production/QA/quote notifications).

### Users, Roles & Permissions (RBAC)
**3 roles**, refined by **11 granular permission toggles** per user.

| Role | Typical access |
|------|----------------|
| **ADMIN** | Everything — financials, reports, user management, settings, cost entry |
| **SALES_AGENT** | Orders, quotes, customers (own or all, by permission) |
| **PRODUCTION** | Production details, status changes, files — no financials |

Granular permissions: `users_manage`, `orders_create`, `orders_view_all`, `orders_view_own_only`, `orders_change_status`, `orders_edit_financials`, `orders_edit_production`, `orders_delete`, `reports_view_financials`, `shipping_view`, `attendance_clock_only` (kiosk mode).

### Settings & Search
- **Settings** — business logo, company config, password change, Meta connection panel, and orphaned-file storage cleanup.
- **Global search** across orders, customers, and quotes.

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
  /search                         Global search results
  /activity                       System activity log
  /inbox  ·  /inbox/:id           Messaging
  /payment-forms                  Manage public payment links
  /clock-in-out                   Attendance / timesheets
  /settings                       Business settings

ADMIN ONLY
  /bulk-cost-entry                Monthly cost entry & operating expenses
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
- **PostgreSQL** with migrations, indexes, and constraints
- **Row-Level Security (RLS)** on every table — staff see all, customers see only their own data (enforced at the database, not just the app)
- **Supabase Auth** — email + password, invite links, password recovery
- **Supabase Storage** — private buckets with signed URLs for mockups, production files, attachments
- **Supabase Realtime** — live order/attendance/messaging updates pushed to all connected staff
- **20 Edge Functions (Deno)** — see below

### Supabase Edge Functions (20)
```
User admin       create-user · update-user · delete-user · get-users
Email            send-email (ZeptoMail, all templates)
Customer portal  invite-customer · mark-password-set
Orders/webhooks  notify-new-checkout-order · notify-order-message
Meta CAPI        send-meta-purchase · reverse-meta-purchase · send-meta-lead-event
                 send-meta-message · meta-webhook · meta-admin
Attribution      store-attribution · store-attribution-token
Payments         create-square-checkout · square-payment-webhook · stripe-balance-webhook
```

### Vercel Serverless (`/api`)
- **`sentry-proxy.ts`** — tunnels Sentry events through first-party domain (bypasses ad blockers), validating project ID/host before relaying.

### Infrastructure
```
Frontend (Vercel)  ──►  Supabase Auth (JWT)
                         │
                         ▼
                   PostgreSQL (RLS) ──► Edge Functions (Deno)
                                          │
            ┌─────────────────────────────┼───────────────────────────┐
            ▼            ▼                 ▼              ▼             ▼
        ZeptoMail    Meta CAPI         Square         Stripe        Sentry
        (email)      (ads)             (checkout)     (payouts)     (errors)
```

---

## Data Model (key tables)

| Table | Purpose |
|-------|---------|
| `orders` | Master order records — customer, design, status, financials, costs, attribution, file URLs |
| `quotes` | Quotes with pricing estimate, attribution, and Meta chat metadata |
| `order_history` | Audit log of every field/status change (user + timestamp) |
| `order_communications` | Per-order email/communication log (internal vs. customer) |
| `order_notes` | Quality feedback, customer calls, complaints, ratings (1–5★) |
| `user_profiles` | Staff accounts — role + granular permissions (JSONB) |
| `customer_profiles` | Customer portal accounts (auto-created on signup, distinct from staff) |
| `customer_notifications` | Status/shipping/delivery alerts for the customer portal |
| `attendance_sessions` | Clock in/out timesheets with auto-clockout flag |
| `monthly_costs` | Monthly operating expenses by category |
| `stripe_webhook_events` | Idempotency dedup for Stripe webhook retries |

Schema lives in [`supabase/migrations/`](supabase/migrations/) (10 migrations).

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
| Meta / Square / Stripe keys | Supabase secrets | CAPI, checkout, and payout integrations |

---

## Deployment

- **Frontend** auto-deploys to **Vercel** on every push to `main`. SPA routing, asset caching, and the Sentry proxy rewrite are configured in [`vercel.json`](vercel.json). Set the Vercel project's **Node.js version to 20.x** to match `engines`.
- **Backend** runs on **Supabase Cloud** — apply migrations and deploy Edge Functions with the Supabase CLI:
  ```bash
  supabase db push                 # apply migrations
  supabase functions deploy        # deploy edge functions
  ```

---

## Security

- **Row-Level Security** on every table — access enforced at the database layer
- **Granular per-user permissions** enforced in both the app and the database
- **Private storage buckets** with signed URLs for all file downloads
- **Invite-link / recovery-link auth** — no plaintext passwords in email
- **Idempotent webhooks** (Stripe event dedup) and **CAPI reversal** on refunds
- **Sentry proxy tunnel** keeps error reporting first-party and resilient to blockers
- **React** auto-escaping (no `dangerouslySetInnerHTML`); inputs normalized (empty → `NULL`) before writes

---

## By the Numbers

| | |
|---|---|
| Staff pages / routes | 23 |
| Reporting modules | 8+ |
| Supabase Edge Functions | 20 |
| Order statuses | 13 |
| User roles · permissions | 3 · 11 |
| Database migrations | 10 |
| Integrations | Supabase · ZeptoMail · Meta CAPI · Square · Stripe · Sentry · Vercel |

---

## Tech Stack Summary

```
Frontend       React 18 · TypeScript 5 · Vite 5
Styling        Tailwind CSS 3 · Framer Motion
State / Data   TanStack Query 5 · React Context
Routing        React Router 6
Forms          React Hook Form 7 · Zod
Charts         Recharts          PDFs   @react-pdf/renderer
Database       PostgreSQL (Supabase) · RLS · migrations
Auth           Supabase Auth (email+password, invite links)
Storage        Supabase Storage (private buckets, signed URLs)
Realtime       Supabase Realtime (WebSocket subscriptions)
Serverless     Supabase Edge Functions (Deno) · Vercel Functions (Node)
Email          ZeptoMail (Zoho)
Payments       Square · Stripe
Marketing      Meta CAPI · UTM / Click-ID attribution
Monitoring     Sentry · Vercel Analytics · Speed Insights
Hosting        Vercel (frontend) · Supabase Cloud (backend)
```

---

<div align="center">

**Built for Panda Patches · Running in production.**

*React · TypeScript · Supabase · Tailwind CSS · Vercel*

</div>
