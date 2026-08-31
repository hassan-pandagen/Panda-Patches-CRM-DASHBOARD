-- ============================================================================
-- SECURITY LOCKDOWN — PART 2 of 2 — close payment_form_tokens enumeration
-- 2026-08-31
--
-- ⚠️  DO NOT APPLY THIS UNTIL THE FRONTEND CHANGE IS LIVE AND VERIFIED.
--
-- Ordering matters in BOTH directions, so this is deliberately a separate file:
--
--   • Apply this while the OLD frontend is still live and every /pay/:token page
--     dies instantly — the old build reads the table directly, and this removes
--     that grant. That is a customer-facing outage on the payment page.
--
--   • Deploy the new frontend before PART 1 is applied and the page dies too —
--     the new build calls get_payment_form_token, which PART 1 creates.
--
-- Correct sequence:
--   1. Apply PART 1                     (creates the RPC; safe with old frontend)
--   2. Deploy the frontend              (starts using the RPC)
--   3. Verify a real payment link loads (see the check at the bottom of this file)
--   4. Apply THIS file                  (closes the enumeration hole)
--   5. Re-run the verification below    (0 rows for anon, page still loads)
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- `anon` could SELECT public.payment_form_tokens with no token filter.
-- Confirmed live: `Content-Range: 0-214/215` — every row. Each carries the
-- customer's name, email, phone, shipping address and order value, plus the live
-- token itself (an unused, unexpired token is a working payment link).
--
-- Revoking the table privilege is definitive regardless of RLS: policies are
-- evaluated only AFTER privileges, so no policy can hand `anon` back what is
-- revoked here.
--
-- `authenticated` deliberately keeps its grant — the staff /payment-forms page
-- (src/pages/PaymentFormPage.tsx) lists, creates and deletes these rows with the
-- signed-in user's JWT. `service_role` keeps its grant — create-square-checkout,
-- store-attribution-token and square-payment-webhook all read and write this
-- table with the service-role client.
-- ============================================================================

REVOKE ALL ON public.payment_form_tokens FROM anon;

-- Tables get no default PUBLIC grant, but revoke defensively in case one was
-- ever added by hand — this project has known drift between migrations and the
-- live schema.
REVOKE ALL ON public.payment_form_tokens FROM PUBLIC;

-- Belt and braces: make sure the roles that DO need it still have it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_form_tokens TO authenticated;
GRANT ALL                            ON public.payment_form_tokens TO service_role;


-- ── Verification ────────────────────────────────────────────────────────────
-- Run from a shell, NOT the SQL editor (the editor connects as a privileged
-- role, so it cannot observe what `anon` sees). Substitute your anon key.
--
--   ANON="<your anon key>"
--   BASE="https://uxgzlneefybifvccfhwp.supabase.co/rest/v1"
--
--   # 1. Enumeration must now be empty (was: 215 rows)
--   curl -s "$BASE/payment_form_tokens?select=id&limit=5" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   # expect: []   (or a permission error — either is fine, both mean closed)
--
--   # 2. The by-token RPC must still return exactly one row
--   curl -s -X POST "$BASE/rpc/get_payment_form_token" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H "Content-Type: application/json" \
--        -d '{"p_token":"<a real unused token>"}'
--   # expect: a single-element array, with NO attribution/created_by keys
--
--   # 3. And the page itself must render the form, not a spinner or error:
--   #    https://login.pandapatches.com/pay/<that token>
--
-- If step 1 still returns rows, the grant came from somewhere else — check
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'payment_form_tokens';
