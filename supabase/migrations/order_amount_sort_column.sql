-- ============================================================================
-- order_amount_sort — generated column for list sorting. Applied 2026-09-07.
--
-- There are NO null amounts in orders (1,201 rows, 0 nulls) — the owner was right that
-- every order carries a figure. But 11 carry ZERO, and zero means several things:
--   6 zeroed by a refund (PP-10982, PP-10957, PP-10891, PP-10773, PP-10756, PP-10615)
--   1 DELIBERATELY FREE  (PP-11163 — a charity order, confirmed by the owner)
--   4 apparently unpriced (PP-10620 SHIPPED at 0, PP-11100, PP-10598, PP-10524)
--
-- ⚠️ Nothing in the data separates those three. A charity order and an order someone
-- forgot to price are byte-identical, which is why PP-11163 looked like a mistake here
-- until the owner said otherwise. If free orders become common enough to matter, they
-- need a marker of their own — an amount of 0 cannot carry the intent.
--
-- Zero therefore means "no price", not "cheapest" — true whether it was waived, refunded
-- or forgotten. Sorting the raw column would open
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
