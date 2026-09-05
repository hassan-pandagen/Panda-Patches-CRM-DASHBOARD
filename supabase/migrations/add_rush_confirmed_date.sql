-- ============================================================================
-- rush_confirmed_date — applied 2026-09-06 (site-audit CLD22B, item 2)
--
-- The rush page promises "exact date confirmed by email within 2-6 hours, fee
-- refunded if we miss it". Two different dates were being conflated:
--   rush_date            = what the CUSTOMER asked for at order time
--   rush_confirmed_date  = what WE committed to in the confirmation email  <-- new
-- Without the second, the on-time rate cannot be computed at all.
--
-- On-time rate, once the window has 20+ orders:
--   SELECT count(*) FILTER (WHERE delivered_at::date <= rush_confirmed_date)::numeric
--          / nullif(count(*),0)
--     FROM orders
--    WHERE rush_confirmed_date IS NOT NULL AND delivered_at IS NOT NULL;
--
-- ⚠️ Only count orders created AFTER this field landed. Historical delivered_at is
-- not trustworthy — see the note below.
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rush_confirmed_date date;

CREATE INDEX IF NOT EXISTS idx_orders_rush_confirmed
  ON public.orders (rush_confirmed_date)
  WHERE rush_confirmed_date IS NOT NULL;

-- ── Two corrections to the brief, from the live data ────────────────────────
-- 1. THE RUSH FLAG IS `is_urgent`, not rush_date. PP-10191 is is_urgent=true with
--    rush_date=null, which is why it looked invisible. The counts differ a lot:
--      is_urgent .................... 59
--      rush_date IS NOT NULL ........ 89
--      is_urgent AND no rush_date ... 27   <- missing from a rush_date-only cut
--      rush_date but NOT is_urgent .. 57   <- counted by rush_date, not flagged urgent
--      union (either) .............. 116
--    Also note is_urgent_approved = 101 > is_urgent = 59, so `approved` is NOT a
--    subset of `urgent` and must not be used as the rush filter either.
--
-- 2. THE BATCH STAMP IS NOT 2026-08-19 10:38:51 — that matches ZERO rows. The real
--    clusters, and only the first is flagged:
--      2026-07-20 12:00:00  x347  delivered_at_estimated = TRUE   (bulk-close, honest)
--      2026-06-08 16:37:42  x127  delivered_at_estimated = false  <- backfill, unflagged
--      2026-06-09 17:04:23  x22   delivered_at_estimated = false  <- backfill, unflagged
--      2026-07-17 16:52:58  x7    delivered_at_estimated = false  <- backfill, unflagged
--    So 156 rows carry a BACKFILLED delivered_at that still looks observed. Those come
--    from add_review_program.sql, which set delivered_at from the first CUSTOMER_DELIVERED
--    email and fell back to updated_at. `delivered_at_estimated = false` is therefore NOT
--    sufficient to filter to trustworthy dates before 2026-07-20.
--
--    Not corrected here: flipping those 156 to estimated=true would change the website's
--    public delivery aggregates, which is Lance's call, not a silent migration.
