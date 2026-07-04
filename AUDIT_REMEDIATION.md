# Audit Remediation — Progress & Status

**Last updated:** 2026-07-02
**Source:** the 4-dimension codebase audit (security · architecture · features/data · UI-UX/a11y).

> ⚠️ **Read this first.** Everything below is **code-complete and type-checked locally** (`tsc --noEmit` = **0 errors**), but **not yet deployed or run end-to-end**. The test suite hasn't executed (npm registry was unreachable during this work) and the edge functions / SQL migrations are **not deployed**. Nothing should be pushed until the **Verification Checklist** at the bottom passes on a solid connection.

---

## 1. Score movement

| Dimension | Before | After *(code)* | Notes |
|---|---|---|---|
| Security | 4.0 | **~6.5** *(after deploy)* / **4.0** *(live until deployed)* | 3 criticals fixed in code; column-mask deferred by choice |
| Architecture / Code Quality | 4.5 | **~7.0** | 107 → 0 TS errors, CI + tests, repo cleaned |
| Data Integrity | 5.0 | **~6.0** | Report accuracy + atomic payments fixed; soft-delete still pending |
| Features | 7.0 | **7.0** | +Stripe→Square, +Germany, +shipping-email photos |
| UI / UX | 7.0 | **~7.5** | Inbox now mobile-usable; modal consistency improving |
| Accessibility | 3.5 | **~5.0** | Modal focus/dialog semantics fixed; contrast + labels remain |
| **Overall** | **5.2** | **~6.3** | Ceiling rises to ~7.5 once deployed + remaining items done |

**Important:** the security number only *lands* after the edge functions + migration are deployed. Until then the live app is unchanged (still 4.0).

---

## 2. Done — code-complete & type-clean

### Security
- **[#1] Admin gate on user-management edge functions** — `create-user`, `update-user`, `get-users` now verify the caller is an admin / `users_manage` before any service-role action (copied `delete-user`'s pattern). Closes the "any staff user can self-promote to ADMIN" hole. Also fixed `create-user`'s role enum (was missing `SALES_AGENT`/`SHIPPING`).
  - `supabase/functions/{create-user,update-user,get-users}/index.ts`
- **[#3] Atomic manual-payment RPC** — new `record_manual_payment()` locks the order row and **increments** `amount_paid` server-side (no more client-computed absolute writes → kills the lost-update race), enforces the over-payment guard + permissions, and records the payment date (previously dropped).
  - `supabase/migrations/secure_payments_and_cleanup.sql` · `src/components/orders/MarkAsPaidModal.tsx`
- **[#2 partial] Dropped the unused `get_orders_paginated` RPC** — it was `SECURITY DEFINER` but trusted a client-supplied role param (anyone could pass `role=ADMIN`). Removed in the same migration. **Deferred:** full financial-column masking for production/shipping roles (see §4).

### Architecture / Code Quality
- **[#9] TypeScript errors: 107 → 0.** `npm run typecheck` is now clean and gated in CI. Real latent bugs fixed along the way:
  - Sentry router tracing was misconfigured (`useNavigation` → `useNavigationType`).
  - All money displays (OrderPage, AllOrdersPage, ProfitLoss, SearchResults) were unguarded against `null` → NaN/crash risk; now `?? 0`.
  - react-query v5 misuse — `isLoading`→`isPending` on mutations; raw tuples passed to `invalidateQueries` (silent no-op invalidations) in `monthlyCostsService` + `MetaCapiPanel` + `MarkAsPaidModal`.
  - Dead imports (`GlassCard`, `IconProps`), bulk-select id type-lie, Zod `.partial()` misuse, Spinner ignoring its `size` prop, `OrderHistory`/`OrderTimeline` snake_case type lie (verified NOT a runtime bug — types were wrong, code was right).
- **[#5] Test infrastructure stood up** (needs `npm install` to run):
  - `vitest.config.ts`, scripts (`test`, `test:watch`, `typecheck`), GitHub Actions CI (`.github/workflows/ci.yml`).
  - **3 real test suites** (~45 assertions) for the business-critical pure functions: `leadSource` (attribution precedence), `patchVocab` (dropdown normalization), `fetchAllPaged` (pagination safety).
- **[#10] Repo hygiene** — untracked **58 `dist/` files** + `src/assets/db_schema.sql` + 2 stale bundles; deleted 3 dead files; `/dist` gitignored.

### Data Integrity
- **[#4] Fixed the 1000-row PostgREST cap** in the P&L / Income-Statement feed + lead-source + payment-recovery + bulk-cost, via one shared `fetchAllPaged()` helper. Reports no longer silently understate past 1000 rows.
  - `src/utils/fetchAllPaged.ts` · `ReportsPage.tsx` · `LeadSourceDistribution.tsx` · `BulkCostEntryPage.tsx`

### UI / UX / Accessibility
- **[#10] Inbox is now mobile-usable** — proper master/detail: full-width conversation list, tap to open a thread full-screen, back button to return; `md+` keeps side-by-side. (Was completely broken on phones.)
- **[#8 in progress] Shared `<Modal>` primitive** with full a11y: `role="dialog"`, `aria-modal`, focus trap, focus return, Escape, backdrop-close, scroll-lock. Migrated: **ConfirmationModal** (used in 4 places, + new `danger` variant), **MarkAsPaidModal**, **GeneratePaymentLinkModal**, **UnsavedChangesModal** (2 places). Removed a now-conflicting global Escape handler so Modal is the single owner.
  - `src/components/ui/Modal.tsx`

### Off-list wins (earlier this session)
- **Stripe → Square** full migration (agent payment links, webhook Flow C for quotes, customer emails) + live Stripe DB teardown.
- **Safari performance fix** (backdrop-filter + fixed-bg disabled on Safari only) — fixed sluggish clicks.
- **Germany** added to country dropdown + live CHECK constraint.
- **Shipping email** now renders proof photos inline + attaches PDF labels.

---

## 3. Deploy / verification queue *(nothing pushed yet)*

These are **written but not live.** Do them together on a solid connection:

1. **Run migrations** (Supabase SQL editor):
   - `supabase/migrations/secure_payments_and_cleanup.sql` (payment RPC + drops unused RPC)
   - (already-written, if not yet applied) `add_country_to_orders.sql`, `drop_stripe_objects.sql`
2. **Deploy edge functions:** `create-user`, `update-user`, `get-users`, `create-square-payment-link`, `square-payment-webhook`, `send-email`
3. **`npm install && npm test`** → confirm the suite is green
4. **`npm run typecheck`** → confirm 0 errors
5. **Push frontend** (carries all TS fixes, Inbox mobile, Modal a11y)

---

## 4. Remaining work

### Roadmap items not started
| # | Item | Why it's deferred | Effort |
|---|---|---|---|
| #2 (rest) | **Financial-column masking** for production/shipping roles | Invasive (route all order reads through a masked view + revoke base-table select); risk-accept given trusted in-house team | ~1 day |
| ~~#6~~ | ✅ **DONE & LIVE** — Soft-delete orders (`deleted_at` + all 3 SELECT RLS policies filter it) + quotes marked converted (not deleted) on both paths; webhook v21; 2 orphans backfilled | done |
| ~~#7~~ | ✅ **DONE (right-sized)** — added an additive **email-miss backstop** in `EmailLogsSection` instead of a risky full outbox cut-over: it compares statuses the order actually reached (`order_history`) vs logged emails, and surfaces any expected-but-never-sent customer email with one-click "Send now". Critical emails (checkout/payment) were already server-side; this closes the real gap (a client-side send that never fired leaves no FAILED row) without touching the working pipeline. Frontend-only. | done |

### #8 Modal — remaining migrations
Same mechanical pattern as the 4 done. Lower-frequency modals:
- `ShippingLabelModal` (has print styles — needs care)
- `InvoiceModal`
- `QuickViewDrawer`
- Inline modals in `OrderPage`, `QuoteDetailPage`, `CustomersPage`, `UserManagementPage`, `InboxPage`

### Accessibility — sub-items still open (why it's ~5, not 7+)
| ID | Item | Status |
|---|---|---|
| A11Y-1/2 | Modal dialog semantics + focus trap | ✅ **Done** for 4 modals; remaining modals pending |
| A11Y-3 | `aria-label` on icon-only buttons (hundreds) | ❌ Not started |
| A11Y-4 | Associate 100+ form `<label>`s (`htmlFor`/`id`) | ❌ Not started (Textarea `label` made optional only) |
| A11Y-5 | `text-slate-500` fails AA contrast (233 uses) | ❌ Not started (global find-replace → `text-slate-400`) |
| A11Y-6 | Input/Textarea errors → `aria-invalid` + `aria-describedby` | ❌ Not started |
| A11Y-7 | Single-key global shortcuts (`n`,`k`,`/`,`g`) need a disable toggle | ❌ Not started |

### Other audit items still open (lower priority)
- ESLint / Prettier not set up (CI runs tests + typecheck only).
- No dedicated payments **ledger table** (audit trail currently in `order_history`).
- `window.confirm` still used for ~8 destructive actions (should route through `ConfirmationModal` + `danger` variant — now available).
- Attribution logic still duplicated inline in the Square webhook (move to `supabase/functions/_shared/` + a parity test).
- `orderService.ts` (783 lines) and `ReportsPage.tsx` (~1900 lines) still want decomposition.
- Hardcoded business config (production-team + vendor emails) still in source.

---

## 5. Testing status

- ✅ **Runner installed and GREEN.** Full suite: **96 tests / 7 files, all passing** (2026-07-03). `tsc --noEmit` = **0 errors**.
- **New suites (high-value, pure functions):**
  - `src/utils/leadSource.test.ts` — attribution precedence, "Checkout is never a source", `/ Checkout` display, web-checkout detection (~22 assertions)
  - `src/utils/patchVocab.test.ts` — patch-type/backing normalization + passthrough (~15 assertions)
  - `src/utils/fetchAllPaged.test.ts` — pagination never truncates; errors throw (~6 assertions)
- **Pre-existing:** `App.test.tsx` (placeholder math), `src/tests/{auth,components,helpers}.test.*` — quality unknown; triage on first run (may need mocks or pruning).
- **Coverage:** effectively 0% until the runner executes; new suites target the highest-risk pure logic first.

---

## 6. Verification checklist (before pushing)

- [x] `npm install` succeeds
- [x] `npm test` — **96 tests / 7 files all green** ✅
- [x] `npm run typecheck` — **0 errors** ✅
- [x] Migration `secure_payments_and_cleanup` applied ✅ (2026-07-03, via MCP)
- [x] Edge functions deployed ✅ — create-user v50, update-user v49, get-users v45, square-payment-webhook v20; create-square-payment-link + send-email already current
- [ ] Migrations applied in Supabase (no errors)
- [ ] Edge functions deployed (6 of them)
- [ ] Manual smoke test: admin can still manage users; a non-admin cannot call `update-user`
- [ ] Manual smoke test: record a $1 manual payment (RPC path) — amount + date save
- [ ] Manual smoke test: P&L report over a >1000-order range shows correct totals
- [ ] Manual smoke test: Inbox on a phone viewport (list → thread → back)
- [ ] Manual smoke test: open/close a migrated modal with Escape + Tab (focus stays trapped)
- [ ] Then push frontend
