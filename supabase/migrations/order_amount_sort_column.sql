-- ============================================================================
-- order_amount_sort — generated column for list sorting. Applied 2026-09-07.
--
-- There are NO null amounts in orders (1,201 rows, 0 nulls) — the owner was right that
-- every order carries a figure. But 11 carry ZERO, and none is a genuine free sale:
--   6 zeroed by a refund (PP-10982, PP-10957, PP-10891, PP-10773, PP-10756, PP-10615)
--   5 never priced      (PP-11163 DELIVERED at 0, PP-10620 SHIPPED at 0,
--                        PP-11100, PP-10598, PP-10524 — PP-10773 is 1,000 pieces at 0)
--
-- Zero therefore means "unknown", not "cheapest". Sorting the raw column would open
-- "amount: low to high" with those eleven — the least informative rows in the table
-- taking the top slot. NULLIF folds 0 to NULL and both directions use NULLS LAST, which
-- is the usual list-view convention: a missing value competes for neither end.
--
-- STORED + indexed both directions, partial on deleted_at IS NULL, so ordering the whole
-- filtered set stays cheap as the table grows.
--
-- ⚠️ Sorting only. Never use it for arithmetic — order_amount is the real figure, and
-- folding 0 to NULL would silently drop those rows out of a SUM or an average.
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_amount_sort numeric
  GENERATED ALWAYS AS (nullif(order_amount, 0)) STORED;

CREATE INDEX IF NOT EXISTS idx_orders_amount_sort_desc
  ON public.orders (order_amount_sort DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_amount_sort_asc
  ON public.orders (order_amount_sort ASC NULLS LAST) WHERE deleted_at IS NULL;
