<div align="center">

# Custom Business CRM & Order Management System

**Production-grade · Full-Stack · White-Label Ready**

[![React](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)](https://vercel.com)

**A fully custom, enterprise-ready CRM + Order Management + Customer Portal system — built to run your entire business.**

</div>

---

## What Is This?

This is a **production-deployed, full-stack business operating system** built for a custom manufacturing company (custom patches, apparel, merchandise). It handles the complete business lifecycle — from the moment a lead comes in, through quoting, ordering, production, shipping, and customer follow-up — all in one place.

Unlike off-the-shelf tools like Shopify, HubSpot, or Trello, every feature here is **purpose-built** for real operational needs. Nothing is bloated. Nothing is missing. It's running in production today, handling real orders and real customers.

**I can customize and deploy this system for your business.** Different industry, different metrics, different workflows — it adapts.

---

## Feature Overview

### Internal CRM / Staff Dashboard

| Module | What It Does |
|--------|-------------|
| **Live Dashboard** | Real-time KPIs — revenue today/week/month, orders by status, production pipeline at a glance |
| **Order Management** | Full order lifecycle with status pipeline, history timeline, file attachments, internal notes |
| **Quotes System** | Create quotes, send to customers, convert to orders with one click — full quote history |
| **Customer Intelligence** | Automatic duplicate detection, lifetime value (LTV) calculation, full order + communication history per customer |
| **Reports & Analytics** | Revenue trends, profit margin analysis, lead source breakdown, country-level reporting, date range filtering |
| **Attendance & Timesheets** | Clock in/out system with shift tracking, daily/weekly/monthly reports, CSV export (timezone-aware) |
| **Cost Management** | Monthly overhead entry (production, shipping, marketing costs), automatic profit margin calculation |
| **User Management** | Create staff accounts, assign roles, set granular permissions per user |
| **Settings** | Business logo, company config, email preferences, notification controls |
| **Search** | Global search across orders, customers, quotes — instant results |

### Customer Portal (Separate Login, Separate Interface)

| Feature | Description |
|---------|-------------|
| **Secure Login** | Email + password login with forgot password flow — no OTP friction |
| **Invite-Link Onboarding** | New customers get a secure invite email with one-click account setup — no password creation confusion |
| **Order Tracking** | Customers see all their orders, current status, and history in real time |
| **File Downloads** | Customers can download their production files and mockups from the portal |
| **Help Center** | Self-service FAQ and support information |
| **Mobile-First** | Fully responsive — works perfectly on mobile where most customers will access it |

### Email Automation

All emails sent via **ZeptoMail** (Zoho) — no email deliverability problems, no spam folder.

| Trigger | Email Sent |
|---------|-----------|
| New order created | Internal notification to staff + customer order confirmation |
| Order status change | Customer notified at every milestone |
| Quote sent | Customer receives quote with pricing details |
| New customer invite | Welcome email with secure account setup link |
| Returning customer login | Magic login link for quick access |
| Order delivered | Delivery confirmation + review request |
| Shipping update | Tracking number notification |

### Role-Based Access Control (RBAC)

Four roles. Granular permission toggles per user. No one sees or touches what they shouldn't.

| Role | Access |
|------|--------|
| **Admin** | Everything — reports, financials, user management, settings |
| **Sales Agent** | Orders, quotes, customers — only their own unless granted view-all |
| **Production** | Production details, file attachments, status updates — no financials |
| **Agent** | Limited scope — clocked-in access only if configured |

Individual permission toggles (can be mixed per user):
- View all orders vs. own orders only
- Edit financial data (costs, pricing, profit)
- Change order status
- Delete orders
- View reports & financials
- Manage users
- Attendance clock only (kiosk mode)

---

## Technical Architecture

### Frontend
- **React 18** + **TypeScript** — 100% type-safe codebase
- **Vite** — sub-second HMR in development, optimized production builds
- **Tailwind CSS** — utility-first styling with a custom brand design system
- **Framer Motion** — smooth page transitions and micro-animations
- **TanStack Query (React Query)** — intelligent server-state caching, background sync, pagination
- **React Hook Form** — performant forms with field-level validation
- **Supabase JS Client** — real-time subscriptions, auth, storage

### Backend (Serverless)
- **Supabase PostgreSQL** — production database with migrations, indexes, and constraints
- **Row Level Security (RLS)** — database-enforced access control, not just app-level
- **Supabase Auth** — email+password, magic links, invite flows — all handled
- **Supabase Edge Functions (Deno)** — serverless business logic deployed at the edge:
  - `send-email` — ZeptoMail integration with 10+ email templates
  - `invite-customer` — secure customer onboarding flow
  - `create-user` — admin-initiated staff account creation
  - `notify-new-checkout-order` — webhook receiver for website checkout
- **Supabase Storage** — production files, mockups, shipping attachments, customer uploads
- **Supabase Realtime** — live order updates pushed to all connected staff — no polling

### Infrastructure
- **Vercel** — frontend hosting with automatic deployments from Git
- **Supabase Cloud** — managed Postgres, Auth, Storage, Edge Functions
- **ZeptoMail (Zoho)** — transactional email delivery
- **Sentry** — error tracking with proxy tunnel for production monitoring

---

## Screens & Pages (18 total)

### Staff Portal

```
/                       → Dashboard (KPIs, live pipeline, recent orders)
/orders                 → All Orders (filter, search, paginate, sort)
/orders/:id             → Order Detail (full lifecycle, history, files, notes)
/orders/new             → Create Order
/orders/:id/edit        → Edit Order
/quotes                 → Quotes List
/quotes/new             → New Quote
/quotes/:id             → Quote Detail (send, convert to order, archive)
/reports                → Analytics & Reports
/clock                  → Clock In/Out (attendance kiosk)
/bulk-costs             → Monthly Cost Entry
/customers/:email       → Customer Profile (LTV, history, comms)
/users                  → User Management (admin only)
/settings               → Business Settings (admin only)
/performance            → APM Metrics (admin only)
/search                 → Global Search Results
```

### Customer Portal

```
/customer/login          → Email + Password Login / Forgot Password
/customer/set-password   → Invite token → account setup
/customer/dashboard      → Order list with status
/customer/orders/:id     → Order detail + file downloads
/customer/profile        → Account info
/customer/help           → FAQ & support
```

---

## Key Business Workflows

### Order Lifecycle
```
Lead Comes In
    ↓
Quote Created → Sent to Customer → Customer Approves
    ↓
Order Created (auto-converted from quote or manual entry)
    ↓
NEW_ORDER → REVISION_REQUESTED → AWAITING_CUSTOMER_APPROVAL → APPROVED
    ↓
IN_PRODUCTION → QUALITY_ASSURANCE → (REMAKE if needed)
    ↓
COMPLETED → SHIPPED → DELIVERED
    ↓
FEEDBACK collected → Customer Portal Review
```

Every status change is logged with timestamp + user email in the order history. Customers are emailed at key milestones. Staff see everything in real time.

### Quote → Order Conversion
One click converts a quote to an order. All customer details, design specs, pricing, and marketing attribution carry over automatically — no re-entry.

### Customer Portal Onboarding
When a new order is created:
1. System checks if customer has a portal account
2. If not → sends invite email with secure 24-hour link
3. Customer clicks → sets their password → immediately sees their orders
4. Future logins → email + password (or forgot-password flow)

---

## Marketing & Attribution Tracking

Built-in infrastructure for tracking where customers come from:

- **Lead Source** field on every order (Google, Facebook, Instagram, TikTok, Referral, etc.)
- **Country tracking** — 5-country dropdown (USA, Australia, Canada, New Zealand, UK) with database-enforced validation
- **UTM / Click ID carry-over** — Attribution data from website checkout flows into orders automatically (Meta fbclid/fbp, Google gclid, UTM parameters)
- **Lead Source Reports** — Visual breakdown by source on the reports page
- **Country Reports** — Regional performance at a glance
- **Meta CAPI ready** — Attribution JSONB column structured for server-side event reporting

---

## Performance & Reliability

| Metric | Value |
|--------|-------|
| TypeScript Coverage | 100% |
| Build Size (gzipped) | ~280KB |
| Lighthouse Score | 92+ |
| WCAG Accessibility | Level AA |
| Real-time latency | <500ms (debounced) |
| Query caching | TanStack Query with intelligent stale times |
| Error tracking | Sentry with source maps |
| Auth token | Auto-refresh, session persistence |
| File uploads | Multi-file, drag-and-drop, progress tracking |

---

## Security

- **Row Level Security (RLS)** on every Supabase table — users only access data they're allowed to
- **SECURITY INVOKER views** — no privilege escalation through database views
- **Input sanitization** — empty strings normalized to NULL before DB writes (prevents date/constraint errors)
- **Granular permissions** — staff can only see/edit what their role allows, enforced at both app and DB layer
- **Secure file storage** — all uploads go to private Supabase Storage buckets with signed URLs
- **Invite-link auth** — no plaintext passwords in emails, no magic-link interception risk on return visits
- **XSS protection** — React's built-in escaping, no dangerouslySetInnerHTML usage
- **CSRF protection** — Supabase JWT-based auth with httpOnly cookies

---

## What Industries This Works For

This system is built for **custom manufacturing, print-on-demand, and service businesses** where:

- Orders go through a production pipeline before delivery
- Customers need visibility into their order status
- Sales agents manage quotes and client relationships
- Costs need tracking for real profit visibility
- Different staff see different parts of the business

**Industries this fits without major changes:**
- Custom apparel & embroidery
- Print shops & signage
- Awards & engraving
- Custom merchandise & branded goods
- Photography studios (booking → delivery)
- Any service business with quote → order → production → delivery flow

**What changes per industry:**
- Status pipeline labels
- Order form fields (design specs, materials, etc.)
- Email templates
- Report metrics and charts
- Color scheme and branding

---

## What You Get (As a Client)

- Full source code — you own it entirely
- Deployed and running on your own Supabase + Vercel accounts
- Custom branding (your logo, your colors, your business name)
- Configured email templates with your domain
- Training on how to manage users and settings
- 2 weeks of post-delivery support

---

## Tech Stack Summary

```
Frontend          React 18 + TypeScript + Vite
Styling           Tailwind CSS + Framer Motion
State             TanStack Query + React Context
Forms             React Hook Form
Database          PostgreSQL (Supabase) with RLS + Migrations
Auth              Supabase Auth (email+password, invite links)
Storage           Supabase Storage (private buckets)
Real-time         Supabase Realtime (WebSocket subscriptions)
Serverless        Supabase Edge Functions (Deno)
Email             ZeptoMail REST API (10+ templates)
Error Tracking    Sentry with proxy tunnel
Hosting           Vercel (frontend) + Supabase Cloud (backend)
```

---

## Project Metrics

| Metric | Value |
|--------|-------|
| Total Pages / Routes | 22 |
| React Components | 60+ |
| Supabase Edge Functions | 5 |
| Email Templates | 10+ |
| Database Tables | 12+ |
| Lines of Code | ~18,000 |
| Build Time | <30s |
| Cold Start (Edge Functions) | <300ms |

---

<div align="center">

**Built with care. Running in production. Ready to be yours.**

*React · TypeScript · Supabase · Tailwind CSS · Vercel · ZeptoMail*

</div>
