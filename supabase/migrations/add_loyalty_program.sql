-- ============================================================================
-- LOYALTY TIER ENGINE (CL86F1 — Bronze / Silver / Gold)
-- Source of truth for tier thresholds, benefits, and rules is CL86F1_1.MD.
--
-- Tiers by LIFETIME PAID value (Square-confirmed amount_paid only; unpaid /
-- pending / cancelled / refunded / soft-deleted orders excluded):
--   Bronze $1,000  → one-time 5% code, 90-day expiry
--   Silver $5,000  → standing 5% code (+ free Velcro + priority mockup: Task 3)
--   Gold   $10,000 → standing 10% code (+ quarterly rush + dedicated contact: Task 3)
--
-- Rules baked in here: tier only goes UP (never auto-downgraded); codes are
-- email-bound; Bronze single-use, Silver/Gold reusable. Discount combinability
-- (calculator-only, no stacking) is enforced at validate time, not here.
--
-- NOT in this migration: the E1–E3 award emails, CRM UI, the perks (Task 3), and
-- Customer-Match segments (Task 4). This is the engine + the validate contract only.
-- ============================================================================

-- ── 1) Tier fields on the customer master record ────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lifetime_paid_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_tier text NOT NULL DEFAULT 'none'
    CHECK (loyalty_tier IN ('none','bronze','silver','gold')),
  ADD COLUMN IF NOT EXISTS bronze_achieved_at timestamptz,
  ADD COLUMN IF NOT EXISTS silver_achieved_at timestamptz,
  ADD COLUMN IF NOT EXISTS gold_achieved_at   timestamptz,
  -- E5 near-threshold nudge: max one per quarter per customer.
  ADD COLUMN IF NOT EXISTS loyalty_nudge_sent_at timestamptz,
  -- Global cap: no customer gets more than one loyalty email per 14-day window
  -- (transactional award wins; marketing E4/E5 respect this).
  ADD COLUMN IF NOT EXISTS loyalty_last_email_at timestamptz;

-- ── 2) loyalty_codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_codes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              text NOT NULL UNIQUE,                 -- PANDA-{TIER}-{6}
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tier              text NOT NULL CHECK (tier IN ('bronze','silver','gold')),
  percent           int  NOT NULL,
  single_use        boolean NOT NULL,
  expires_at        timestamptz,                          -- Bronze: awarded+90d; Silver/Gold: null
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','redeemed','revoked')),
  award_email_sent_at timestamptz,                        -- null = E1/E2/E3 award email still pending
  reminder_sent_at  timestamptz,                          -- E4 Bronze-expiry reminder (one only)
  redeemed_at       timestamptz,
  redeemed_order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by        text NOT NULL DEFAULT 'system',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_codes_customer ON public.loyalty_codes (customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_codes_award_pending
  ON public.loyalty_codes (created_at) WHERE award_email_sent_at IS NULL;

COMMENT ON TABLE public.loyalty_codes IS
  'Personal, email-bound loyalty discount codes (CL86F1). Bronze=single-use 90-day; Silver/Gold=reusable standing. Written by the tier engine + admin overrides. Validated by validate-loyalty-code (calculator-pricing only, no stacking).';

-- ── 3) Helpers ──────────────────────────────────────────────────────────────
-- Numeric rank so "tier only goes up" is a simple comparison.
CREATE OR REPLACE FUNCTION public.loyalty_tier_rank(p_tier text)
  RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tier WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1 ELSE 0 END;
$$;

-- PANDA-{TIER}-{6 unambiguous alphanum}. Alphabet excludes 0/O/1/I to avoid mis-typing.
CREATE OR REPLACE FUNCTION public.gen_loyalty_code(p_tier text)
  RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text;
  candidate text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..6 LOOP
      suffix := suffix || substr(alphabet, floor(random()*length(alphabet))::int + 1, 1);
    END LOOP;
    candidate := 'PANDA-' || upper(p_tier) || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.loyalty_codes WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- ── 4) Recompute one customer's lifetime paid value + tier ───────────────────
-- Idempotent. Recomputes the paid total every call; awards a tier + issues its code
-- ONLY when the computed tier is strictly higher than the stored one (never downgrades).
CREATE OR REPLACE FUNCTION public.recompute_customer_loyalty(p_customer_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_email        text;
  v_paid         numeric(12,2);
  v_current_tier text;
  v_new_tier     text;
BEGIN
  SELECT normalized_email, COALESCE(loyalty_tier,'none')
    INTO v_email, v_current_tier
    FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Square-confirmed lifetime paid value. amount_paid>0 excludes unpaid/pending;
  -- status filter excludes cancelled/refunded; deleted_at excludes soft-deleted.
  SELECT COALESCE(sum(amount_paid), 0)
    INTO v_paid
    FROM orders
   WHERE lower(btrim(customer_email)) = v_email
     AND deleted_at IS NULL
     AND amount_paid > 0
     AND status NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT');

  v_new_tier := CASE
    WHEN v_paid >= 10000 THEN 'gold'
    WHEN v_paid >= 5000  THEN 'silver'
    WHEN v_paid >= 1000  THEN 'bronze'
    ELSE 'none' END;

  UPDATE customers SET lifetime_paid_value = v_paid WHERE id = p_customer_id;

  -- Only-up: award only when the new tier outranks the stored one.
  IF loyalty_tier_rank(v_new_tier) > loyalty_tier_rank(v_current_tier) THEN
    UPDATE customers
       SET loyalty_tier = v_new_tier,
           bronze_achieved_at = CASE WHEN v_new_tier IN ('bronze','silver','gold') AND bronze_achieved_at IS NULL THEN now() ELSE bronze_achieved_at END,
           silver_achieved_at = CASE WHEN v_new_tier IN ('silver','gold') AND silver_achieved_at IS NULL THEN now() ELSE silver_achieved_at END,
           gold_achieved_at   = CASE WHEN v_new_tier = 'gold' AND gold_achieved_at IS NULL THEN now() ELSE gold_achieved_at END
     WHERE id = p_customer_id;

    -- Issue the code for the achieved tier (only if they don't already have an active one).
    IF NOT EXISTS (
      SELECT 1 FROM loyalty_codes
       WHERE customer_id = p_customer_id AND tier = v_new_tier AND status = 'active'
    ) THEN
      INSERT INTO loyalty_codes (code, customer_id, tier, percent, single_use, expires_at)
      VALUES (
        gen_loyalty_code(v_new_tier),
        p_customer_id,
        v_new_tier,
        CASE v_new_tier WHEN 'gold' THEN 10 ELSE 5 END,             -- Gold 10%, Bronze/Silver 5%
        (v_new_tier = 'bronze'),                                    -- Bronze single-use only
        CASE v_new_tier WHEN 'bronze' THEN now() + interval '90 days' ELSE NULL END
      );
    END IF;
  END IF;
END;
$$;

-- ── 5) Recompute-all (for backfill + the nightly reconciliation job) ─────────
CREATE OR REPLACE FUNCTION public.recompute_all_loyalty()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM customers WHERE is_active AND merged_into_id IS NULL LOOP
    PERFORM recompute_customer_loyalty(r.id);
  END LOOP;
END;
$$;

-- ── 6) Trigger: recompute on any payment/status change to an order ───────────
-- Fires on every path that can change paid value (Square webhook, manual mark-paid,
-- status → cancelled/refunded, soft-delete). Matches the order to a customer by
-- normalized email; guest orders with no customer row are simply skipped.
CREATE OR REPLACE FUNCTION public.trg_orders_recompute_loyalty()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE v_cust uuid;
BEGIN
  SELECT id INTO v_cust
    FROM customers
   WHERE normalized_email = lower(btrim(COALESCE(NEW.customer_email, '')))
     AND is_active
   LIMIT 1;
  IF v_cust IS NOT NULL THEN
    PERFORM recompute_customer_loyalty(v_cust);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_loyalty ON public.orders;
CREATE TRIGGER trg_orders_loyalty
  AFTER INSERT OR UPDATE OF amount_paid, status, deleted_at ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_recompute_loyalty();

-- ── 7) Lockdown ─────────────────────────────────────────────────────────────
-- loyalty_codes: staff-only (portal customers are `authenticated`, so gate on
-- user_profiles like the customers table does). Service role bypasses RLS for the
-- engine + validate function.
ALTER TABLE public.loyalty_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_codes FROM anon;
CREATE POLICY "Staff read loyalty codes" ON public.loyalty_codes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- ── 8) One-time backfill: set lifetime value + tier for everyone ────────────
-- Awards codes + stamps tier_achieved_at for existing qualifying customers.
SELECT public.recompute_all_loyalty();

-- Silence the backfill: mark every code created by the backfill as already-emailed so
-- the award-email job does NOT blast "You earned Bronze!" to customers who crossed the
-- line months/years ago. Only NEW awards (issued by the orders trigger after this
-- migration) keep award_email_sent_at NULL and therefore actually email.
UPDATE public.loyalty_codes SET award_email_sent_at = now() WHERE award_email_sent_at IS NULL;
