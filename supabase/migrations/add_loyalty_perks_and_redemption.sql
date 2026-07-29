-- ============================================================================
-- LOYALTY — redemption + perks + segments  (CL86F1 Tasks 3 & 4, engine gaps)
-- Depends on add_loyalty_program.sql. Adds:
--   • how a code gets SPENT (redemption)               (engine gap)
--   • the perk data layer: priority mockup + Gold rush (Task 3)
--   • a per-tier Customer-Match audience view          (Task 4)
--   • a staff-gated per-tier Reports RPC               (Task 4)
-- Free-Velcro is a pricing-time UI concern (order builder) — no schema needed here.
-- ============================================================================

-- ── 1) Order-level loyalty fields ───────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_code_used text,
  ADD COLUMN IF NOT EXISTS loyalty_discount_percent int,
  ADD COLUMN IF NOT EXISTS priority_mockup boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.loyalty_code_used IS
  'The loyalty code applied to this order (set by the website/order-builder). Drives redemption + the E6 confirmation line.';
COMMENT ON COLUMN public.orders.priority_mockup IS
  'True when placed by a Silver/Gold customer — surfaced in the design/production queue (CL86F1 Task 3).';

-- Priority-mockup flag: stamp at insert from the customer's current tier.
CREATE OR REPLACE FUNCTION public.set_order_priority_mockup()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tier text;
BEGIN
  SELECT loyalty_tier INTO v_tier
    FROM customers
   WHERE normalized_email = lower(btrim(COALESCE(NEW.customer_email,''))) AND is_active
   LIMIT 1;
  IF v_tier IN ('silver','gold') THEN
    NEW.priority_mockup := true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_orders_priority_mockup ON public.orders;
CREATE TRIGGER trg_orders_priority_mockup
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_priority_mockup();

-- ── 2) Redemption — spend a single-use (Bronze) code when a paid order uses it ─
-- Validate (the edge fn) only CHECKS; this is what actually marks it redeemed.
-- Reusable Silver/Gold codes stay 'active' (no state change). Fires on the order
-- becoming genuinely paid with a code attached.
CREATE OR REPLACE FUNCTION public.trg_orders_loyalty_redeem()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.loyalty_code_used IS NOT NULL
     AND NEW.amount_paid > 0
     AND NEW.status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT') THEN
    UPDATE loyalty_codes
       SET status = 'redeemed', redeemed_at = now(), redeemed_order_id = NEW.id
     WHERE upper(code) = upper(NEW.loyalty_code_used)
       AND single_use
       AND status = 'active';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_orders_loyalty_redeem ON public.orders;
CREATE TRIGGER trg_orders_loyalty_redeem
  AFTER INSERT OR UPDATE OF amount_paid, status, loyalty_code_used ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_loyalty_redeem();

-- ── 3) Gold quarterly rush upgrade ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_rush_upgrades (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id    bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  quarter     text NOT NULL,            -- e.g. '2026Q3'
  used_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, quarter)          -- one free rush per quarter, enforced
);
ALTER TABLE public.loyalty_rush_upgrades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_rush_upgrades FROM anon;
CREATE POLICY "Staff read rush upgrades" ON public.loyalty_rush_upgrades
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.loyalty_current_quarter()
  RETURNS text LANGUAGE sql STABLE AS $$
  SELECT extract(year from now())::text || 'Q' || extract(quarter from now())::text;
$$;

CREATE OR REPLACE FUNCTION public.gold_rush_available(p_customer_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND loyalty_tier = 'gold')
     AND NOT EXISTS (
       SELECT 1 FROM loyalty_rush_upgrades
        WHERE customer_id = p_customer_id AND quarter = loyalty_current_quarter());
$$;

-- Order-builder calls this to consume the free rush; returns false if none available.
CREATE OR REPLACE FUNCTION public.use_gold_rush_upgrade(p_customer_id uuid, p_order_id bigint)
  RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT gold_rush_available(p_customer_id) THEN RETURN false; END IF;
  INSERT INTO loyalty_rush_upgrades (customer_id, order_id, quarter)
  VALUES (p_customer_id, p_order_id, loyalty_current_quarter())
  ON CONFLICT (customer_id, quarter) DO NOTHING;
  RETURN FOUND;
END; $$;

-- ── 4) Task 4 — per-tier Customer-Match audience (ADDITIVE; frozen views untouched) ─
-- Tiered customers as an ad audience, opt-outs excluded, locked to service role.
CREATE OR REPLACE VIEW public.google_ads_loyalty_tier_audience
WITH (security_barrier = true) AS
  SELECT c.normalized_email AS email,
         c.loyalty_tier,
         c.lifetime_paid_value
    FROM public.customers c
   WHERE c.is_active
     AND c.merged_into_id IS NULL
     AND c.loyalty_tier <> 'none'
     AND c.normalized_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     AND NOT EXISTS (
       SELECT 1 FROM public.customer_privacy_optouts x
        WHERE lower(btrim(x.email)) = c.normalized_email
           OR x.customer_id = c.id);

REVOKE ALL ON public.google_ads_loyalty_tier_audience FROM anon, authenticated;

-- ── 5) Task 4 — per-tier Reports metrics (staff-gated) ──────────────────────
-- Production/shipping/customers excluded (financial-ish sales data). The incremental
-- code-user-vs-non-user reorder lift needs Trustpilot-style attribution and is left for
-- the Reports UI phase; this returns the core per-tier figures.
CREATE OR REPLACE FUNCTION public.loyalty_tier_stats()
  RETURNS TABLE (
    tier text,
    customers bigint,
    total_lifetime_value numeric,
    avg_lifetime_value numeric,
    active_codes bigint,
    redeemed_codes bigint,
    reorder_rate numeric               -- share of tier customers with ≥1 reorder
  )
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF get_user_role() NOT IN ('ADMIN','SALES_AGENT') THEN
    RAISE EXCEPTION 'Not authorized to view loyalty metrics';
  END IF;

  RETURN QUERY
  WITH tiers AS (SELECT unnest(ARRAY['bronze','silver','gold']) AS tier),
  cust AS (
    SELECT c.loyalty_tier AS tier, c.id, c.normalized_email, c.lifetime_paid_value
      FROM customers c
     WHERE c.is_active AND c.merged_into_id IS NULL AND c.loyalty_tier <> 'none'
  ),
  reord AS (
    SELECT DISTINCT lower(btrim(o.customer_email)) AS email
      FROM orders o
     WHERE o.is_reorder AND o.deleted_at IS NULL
  )
  SELECT t.tier,
         count(cu.id),
         COALESCE(sum(cu.lifetime_paid_value), 0),
         COALESCE(round(avg(cu.lifetime_paid_value), 2), 0),
         (SELECT count(*) FROM loyalty_codes lc WHERE lc.tier = t.tier AND lc.status = 'active'),
         (SELECT count(*) FROM loyalty_codes lc WHERE lc.tier = t.tier AND lc.status = 'redeemed'),
         CASE WHEN count(cu.id) = 0 THEN 0
              ELSE round(count(*) FILTER (WHERE r.email IS NOT NULL)::numeric / count(cu.id), 3) END
    FROM tiers t
    LEFT JOIN cust cu ON cu.tier = t.tier
    LEFT JOIN reord r ON r.email = cu.normalized_email
   GROUP BY t.tier
   ORDER BY CASE t.tier WHEN 'gold' THEN 1 WHEN 'silver' THEN 2 ELSE 3 END;
END; $$;

REVOKE ALL ON FUNCTION public.loyalty_tier_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.loyalty_tier_stats() TO authenticated;
