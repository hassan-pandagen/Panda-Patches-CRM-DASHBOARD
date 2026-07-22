-- Applied 2026-07-22 via Supabase MCP (remote version: add_reorder_and_payment_link_columns_to_orders)
-- Foundation for the CRM "Add Order" / "Re-order" feature (spec CL75FF).
-- Additive only. No CHECK constraints exist on orders.status / payment_status, so the new
-- status value 'PENDING_PAYMENT' and payment_status values 'unpaid' / 'deposit_paid' are
-- introduced in application code without a DB constraint change.
ALTER TABLE public.orders
  ADD COLUMN is_reorder boolean NOT NULL DEFAULT false,
  ADD COLUMN square_payment_link_id text;

COMMENT ON COLUMN public.orders.is_reorder IS
  'True when created via the Re-order flow (or backfilled when the customer email matches a prior paid order). CRM metric only — never uploaded to Google Ads as a conversion.';
COMMENT ON COLUMN public.orders.square_payment_link_id IS
  'Square Payment Link / checkout id, stored at link creation. The webhook matches incoming payments to this order by this id — never by amount or email.';

-- Webhook matches payments to the order by this id: partial index keeps the lookup fast
-- and small (only orders that carry a generated link).
CREATE INDEX IF NOT EXISTS idx_orders_square_payment_link_id
  ON public.orders (square_payment_link_id)
  WHERE square_payment_link_id IS NOT NULL;

-- Reorder metrics filter on the flag; partial index covers the true rows only.
CREATE INDEX IF NOT EXISTS idx_orders_is_reorder
  ON public.orders (is_reorder)
  WHERE is_reorder;
