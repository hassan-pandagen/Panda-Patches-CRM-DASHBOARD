-- ============================================================================
-- SECURITY LOCKDOWN — PART 4 — restrict listing on public storage buckets
-- 2026-08-31 · APPLIED via MCP the same day, in three passes (one-bucket trial →
-- rollout → staff-scoping) · follows parts 1–3
--
-- This file reflects the FINAL applied state.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Advisor lint 0025 (public_bucket_allows_listing). Four public buckets carried a
-- broad SELECT policy on storage.objects granted to {public}, letting anyone with
-- the anon key ENUMERATE every file — customer artwork, production files and quote
-- mockups included. Confirmed live before the fix: anon listed 19 objects in
-- customer-artwork and 100+ in order-attachments.
--
-- ── Why this doesn't break emails or the customer portal ────────────────────
-- Public object access by URL (/storage/v1/object/public/<bucket>/<path>) is
-- granted by the BUCKET's `public` flag and does NOT consult these policies.
-- Only listing / the storage SELECT API does. Verified on one bucket BEFORE
-- rolling out:
--   before → object HTTP 200 / 95110 bytes (no key at all), anon list = 19
--   after  → object HTTP 200 / 95110 bytes (no key at all), anon list =  0
--   control: order-attachments still listed 100, proving the change was scoped
--
-- Nothing customer-facing uses the storage list/SELECT API at all:
--   • website repo (panda-patches-ecommerce): 0 `.list(`, 0 `createSignedUrl`,
--     7 `getPublicUrl` — every customer-facing file is served by public URL.
--   • CRM: 4 `getPublicUrl`, 0 `createSignedUrl`. The ONLY list() caller is
--     src/services/storageCleanup.ts:99,115 (Settings → orphaned-file cleanup),
--     which runs as a signed-in staff user over order-attachments,
--     production-files and quote-mockups.
--
-- ── Why STAFF-scoped and not just {authenticated} ───────────────────────────
-- A plain {authenticated} policy still covers CUSTOMER PORTAL logins —
-- customer_profiles is 1:1 with the portal's auth.users, and there are 583 portal
-- customers vs 12 staff — so any signed-in customer could have listed every file.
-- The predicate below is the one already established in 004_customer_portal.sql.
-- It resolves because user_profiles' own `users_read_own` policy is
--   (auth.uid() = id) OR is_admin()
-- so a staff member can read their own row. Verified: a staff uid matches 1 row,
-- a portal-customer uid matches 0.
-- ============================================================================

-- Drop every prior variant (the {public} originals and the interim {authenticated} pass)
DROP POLICY IF EXISTS "allow_public_read_customer_artwork"          ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_read_customer_artwork"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from order-attachments"   ON storage.objects;
DROP POLICY IF EXISTS "allow_public_read_order_attachments"         ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_read_order_attachments"  ON storage.objects;
DROP POLICY IF EXISTS "allow_public_read_production_files"          ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_read_production_files"   ON storage.objects;
DROP POLICY IF EXISTS "allow_public_read_quote_mockups"             ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_read_quote_mockups"      ON storage.objects;

CREATE POLICY "staff_read_customer_artwork"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-artwork'
         AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "staff_read_order_attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-attachments'
         AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "staff_read_production_files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'production-files'
         AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "staff_read_quote_mockups"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-mockups'
         AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()));

-- Existing {authenticated} DELETE policies on these buckets are intentionally untouched.

-- ── Verification (run from a shell; the SQL editor is a privileged role) ─────
--   ANON="<anon key>"; S="https://uxgzlneefybifvccfhwp.supabase.co/storage/v1"
--   for b in customer-artwork order-attachments production-files quote-mockups; do
--     curl -s -X POST "$S/object/list/$b" -H "apikey: $ANON" \
--          -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
--          -d '{"prefix":"","limit":100}'      # expect: []
--   done
--   curl -s -o /dev/null -w "%{http_code}\n" "$S/object/public/<bucket>/<file>"  # expect: 200
--
--   After deploying, also confirm Settings → orphaned-file cleanup still scans
--   (it is the only staff feature that depends on the SELECT policy).
