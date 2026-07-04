-- Soft-delete for orders + preserve quotes on conversion.
-- APPLIED TO PROD 2026-07-03 via MCP; captured here so a rebuild-from-repo keeps the guarantees.

-- ── ORDERS: soft-delete ────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders (id) WHERE deleted_at IS NULL;

-- Add "AND deleted_at IS NULL" to ALL THREE SELECT policies (they OR together, so a
-- soft-deleted order must be excluded from each) — hides it from every read path at the DB
-- layer. ALTER (not drop/recreate) so the table is never left without a policy.
ALTER POLICY orders_select_policy ON public.orders
  USING ((is_admin() OR has_permission('orders_view_all'::text) OR (sales_agent = get_user_email())) AND deleted_at IS NULL);

ALTER POLICY customers_read_own_orders_by_user_id ON public.orders
  USING ((user_id = (SELECT auth.uid())) AND deleted_at IS NULL);

ALTER POLICY customers_read_own_orders ON public.orders
  USING (
    (
      (customer_email = (SELECT customer_profiles.email FROM customer_profiles WHERE customer_profiles.id = (SELECT auth.uid())))
      OR (cc_email = (SELECT customer_profiles.email FROM customer_profiles WHERE customer_profiles.id = (SELECT auth.uid())))
    )
    AND deleted_at IS NULL
  );

-- ── QUOTES: keep the row on conversion (mark it), don't hard-delete ─────
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS converted_order_id bigint;
