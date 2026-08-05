-- ============================================================================
-- FIX: customer_flags missing unique index on customer_email  (2026-08-03)
-- setPremiumStatus() (src/services/customerFlagsService.ts) upserts with
-- `onConflict: 'customer_email'`, but the only unique index on customer_flags was
-- the primary key (a different column). With no unique index on customer_email the
-- upsert threw 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") — surfaced in prod Postgres logs at 2026-08-03 02:08:56 when the
-- Premium-flag feature was used. Applied directly to prod; recorded here so the repo
-- matches. Idempotent. Creating it succeeded with no duplicate-key error, confirming
-- customer_email held no duplicates.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS customer_flags_customer_email_key
  ON public.customer_flags (customer_email);
