# Customer Portal Journey — Design & Implementation Notes

**Owner:** Panda Patches CRM team
**Last updated:** 2026-04-21
**Purpose:** Capture the customer-portal vision, current implementation state, and open items so context isn't lost between sessions.

---

## 1. North-star journey

The goal is a **self-serve tracking portal** backed by a frictionless auth flow, with the CRM acting as the source of truth for orders.

### 1.1 First-time customer (new order)

1. Order placed (either checkout site → DB, or CRM admin creates it).
2. Customer receives **ONE combined email**: "Order Confirmed — Track Your Order" with a primary CTA button ("Set Up Your Portal"). The CTA is a 24h-valid Supabase invite token.
3. Customer taps CTA → lands on `/customer/set-password` (mobile-optimised, 16px inputs to avoid iOS auto-zoom).
4. Picks a password → lands in `/customer/dashboard` with their new order already visible.
5. At each status change (mockup ready, production, shipped, delivered) they get a status email with a "View Order" button deep-linking back to the portal.

### 1.2 Returning customer (new order, already has portal account)

1. Order placed.
2. Customer receives the same confirmation email, but the CTA now says **"Track Order"** and carries a magic-login link (1h-24h valid).
3. Tap → `/customer/auth/callback` → `/customer/dashboard`, no password prompt.
4. Subsequent visits just use email + password login at `/customer/login`.

### 1.3 Bulk invite for existing customers (CEO ask)

One-shot migration: for every distinct `customer_email` in `orders` that does **not** yet have a `customer_profiles` row, send an invite.

Recommended rollout:
- Set **Supabase → Auth → Providers → Email → OTP Expiry** to `86400` (24h max) before the blast.
- Throttle to ~10 invites/sec to avoid auth rate-limits.
- Spread the blast over a few days so the 24h invite window is actually useful for people who don't check email daily.
- Add a "Resend invite" button on the CRM order page for people who say they never got the link.

### 1.4 Rejected design choices

- **Emailing plaintext passwords** (the CEO's original idea) — rejected. Plaintext passwords in email inboxes is a security anti-pattern; invite links avoid it and the customer picks their own password.
- **Magic-link-only flow** (the original v0 of this portal) — rejected. Customers can't log back in after the link expires. Swapped for email+password with magic-link-as-invite.

---

## 2. What's built

| Piece | File | Status |
|---|---|---|
| Invite edge function | [`supabase/functions/invite-customer/index.ts`](../supabase/functions/invite-customer/index.ts) | ✅ Deployed |
| Welcome + returning-login email templates | [`supabase/functions/send-email/index.ts`](../supabase/functions/send-email/index.ts) (templates `CUSTOMER_WELCOME_INVITE`, `CUSTOMER_RETURNING_LOGIN`) | ✅ Deployed |
| Set-password page | [`src/pages/customer/CustomerSetPasswordPage.tsx`](../src/pages/customer/CustomerSetPasswordPage.tsx) | ✅ |
| Login page (email+password + Forgot Password) | [`src/pages/customer/CustomerLoginPage.tsx`](../src/pages/customer/CustomerLoginPage.tsx) | ✅ |
| Auto-invite hook — checkout orders | [`supabase/functions/notify-new-checkout-order/index.ts`](../supabase/functions/notify-new-checkout-order/index.ts) | ✅ Deployed |
| Auto-invite hook — CRM-created orders | [`src/services/orderService.ts`](../src/services/orderService.ts) (Step 8b in `createOrder`) | ✅ Client-side; ⚠️ requires frontend redeploy |
| Route registration | [`src/App.tsx`](../src/App.tsx) | ✅ |

### Key Supabase settings to verify in the dashboard

- **Authentication → URL Configuration → Redirect URLs** must include:
  - `https://portal.pandapatches.com/customer/set-password`
  - `https://portal.pandapatches.com/customer/auth/callback`
  - `http://localhost:5173/customer/set-password` (dev)
  - `http://localhost:5174/customer/set-password` (dev)
- **Authentication → Providers → Email → OTP Expiry** = `86400` (24h) before any bulk invite blast.
- **Secrets**: `ZEPTOMAIL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. Open items / roadmap

### 3.1 Next (waiting on CEO sign-off)

- **Bulk invite admin action**. New "Invite existing customers" button in CRM settings. Queries `orders.customer_email` ∖ `customer_profiles.email`, paginates and rate-limits invite calls.
- **Merge order-confirmation + invite into a single email**. Currently the customer gets `CUSTOMER_NEW_ORDER` shortly followed by the invite email. Unify under one template so first contact is one email with one CTA.
- **Resend invite button** on the order page (admin only). Calls `invite-customer` for the customer email on that order.

### 3.2 White-label / agency future (CEO hinted; NOT scoped yet)

When the CEO greenlights the agency side, these are the columns that'll likely be needed:

- `customer_organizations(id, name, brand_config jsonb)` — agencies.
- `customer_profiles.organization_id` — which agency a rep belongs to.
- `customer_profiles.role` — `rep | admin | end_client` inside the org.
- `orders.organization_id` — attribution for rep-placed orders.
- Per-agency pricing: flag or joined rate card.

### 3.3 Technical debt / cleanup

- Both customer + CRM auth share the same Supabase project. `/login` (staff) and `/customer/login` (customer) use different `user_profiles` vs `customer_profiles` tables. The trigger `on_customer_signup` auto-creates a `customer_profiles` row ONLY when the new auth user is **not** already a staff user — careful with any script that promotes a customer to staff.
- No `paid_at` timestamp on `orders` — payment state derived from `amount_paid >= order_amount`. Plumbing for Meta CAPI / revenue attribution may need this added later.

---

## 4. Troubleshooting quick-reference

| Symptom | Likely cause | Where to look |
|---|---|---|
| New order → no invite email | Frontend not redeployed after merging the invite hook | `supabase/functions/invite-customer/logs` — if no calls arriving, rebuild/redeploy frontend |
| Invite link "expired" | OTP expiry set below 24h | Supabase → Auth → Providers → Email → OTP Expiry |
| Invite link "redirect not allowed" | Redirect URL not whitelisted | Supabase → Auth → URL Configuration |
| Customer can log in but no orders show | Email mismatch vs `customer_email` / `cc_email` on order; or RLS blocking | Check `customer_profiles.email` and order rows; RLS policies in migration 004 |
| Portal dashboard redirects to login repeatedly | Auth user has no `customer_profiles` row (likely they're in `user_profiles` = staff user) | `customer_profiles` table + `handle_new_customer()` trigger |

---

## 5. Decisions log

- **2026-04-17** — chose invite-link over "email plaintext password" flow for security. Kept email+password as the long-term login mechanism (not magic-link-only).
- **2026-04-17** — made customer pages mobile-first (16px inputs, `py-4` touch targets, collage-friendly CTA button in email).
- **2026-04-21** — CEO ask: bulk-invite existing customers. Agreed to defer the build until after the demo so we can confirm scope (include agency side? or MVP one-shot?).
