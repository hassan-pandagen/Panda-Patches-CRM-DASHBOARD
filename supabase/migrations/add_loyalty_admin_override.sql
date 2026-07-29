-- ============================================================================
-- LOYALTY ADMIN OVERRIDE  (CL86F1 Task 2.4)
-- Manually grant/revoke a tier or reissue a code, with a REQUIRED reason + audit log.
-- Owner-only (ADMIN). All three RPCs are SECURITY DEFINER but hard-check the caller.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loyalty_admin_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  action       text NOT NULL,             -- grant_tier | revoke_tier | reissue_code
  detail       text,
  reason       text NOT NULL,
  actor_email  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loyalty_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_admin_audit FROM anon;
CREATE POLICY "Staff read loyalty audit" ON public.loyalty_admin_audit
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid()));

-- Shared guard: ADMIN + non-empty reason.
CREATE OR REPLACE FUNCTION public.loyalty_require_admin(p_reason text)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can override loyalty';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
END; $$;

-- Grant (or force) a tier. Stamps achieved-at + issues that tier's code if missing.
CREATE OR REPLACE FUNCTION public.grant_loyalty_tier(p_customer_id uuid, p_tier text, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := get_user_email();
BEGIN
  PERFORM loyalty_require_admin(p_reason);
  IF p_tier NOT IN ('none','bronze','silver','gold') THEN RAISE EXCEPTION 'Invalid tier %', p_tier; END IF;

  UPDATE customers
     SET loyalty_tier = p_tier,
         bronze_achieved_at = CASE WHEN p_tier IN ('bronze','silver','gold') AND bronze_achieved_at IS NULL THEN now() ELSE bronze_achieved_at END,
         silver_achieved_at = CASE WHEN p_tier IN ('silver','gold') AND silver_achieved_at IS NULL THEN now() ELSE silver_achieved_at END,
         gold_achieved_at   = CASE WHEN p_tier = 'gold' AND gold_achieved_at IS NULL THEN now() ELSE gold_achieved_at END
   WHERE id = p_customer_id;

  IF p_tier <> 'none' AND NOT EXISTS (
    SELECT 1 FROM loyalty_codes WHERE customer_id = p_customer_id AND tier = p_tier AND status = 'active'
  ) THEN
    INSERT INTO loyalty_codes (code, customer_id, tier, percent, single_use, expires_at, created_by)
    VALUES (gen_loyalty_code(p_tier), p_customer_id, p_tier,
            CASE p_tier WHEN 'gold' THEN 10 ELSE 5 END,
            (p_tier = 'bronze'),
            CASE p_tier WHEN 'bronze' THEN now() + interval '90 days' ELSE NULL END,
            'admin:' || v_email);
  END IF;

  INSERT INTO loyalty_admin_audit (customer_id, action, detail, reason, actor_email)
  VALUES (p_customer_id, 'grant_tier', 'tier=' || p_tier, p_reason, v_email);
END; $$;

-- Revoke: drop to 'none' and revoke all active codes.
CREATE OR REPLACE FUNCTION public.revoke_loyalty_tier(p_customer_id uuid, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := get_user_email();
BEGIN
  PERFORM loyalty_require_admin(p_reason);
  UPDATE customers SET loyalty_tier = 'none' WHERE id = p_customer_id;
  UPDATE loyalty_codes SET status = 'revoked' WHERE customer_id = p_customer_id AND status = 'active';
  INSERT INTO loyalty_admin_audit (customer_id, action, detail, reason, actor_email)
  VALUES (p_customer_id, 'revoke_tier', 'tier=none, codes revoked', p_reason, v_email);
END; $$;

-- Reissue: revoke the current active code for a tier and mint a fresh one. Returns the new code.
CREATE OR REPLACE FUNCTION public.reissue_loyalty_code(p_customer_id uuid, p_tier text, p_reason text)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := get_user_email(); v_code text;
BEGIN
  PERFORM loyalty_require_admin(p_reason);
  IF p_tier NOT IN ('bronze','silver','gold') THEN RAISE EXCEPTION 'Invalid tier %', p_tier; END IF;

  UPDATE loyalty_codes SET status = 'revoked'
   WHERE customer_id = p_customer_id AND tier = p_tier AND status = 'active';

  v_code := gen_loyalty_code(p_tier);
  INSERT INTO loyalty_codes (code, customer_id, tier, percent, single_use, expires_at, created_by)
  VALUES (v_code, p_customer_id, p_tier,
          CASE p_tier WHEN 'gold' THEN 10 ELSE 5 END,
          (p_tier = 'bronze'),
          CASE p_tier WHEN 'bronze' THEN now() + interval '90 days' ELSE NULL END,
          'admin:' || v_email);

  INSERT INTO loyalty_admin_audit (customer_id, action, detail, reason, actor_email)
  VALUES (p_customer_id, 'reissue_code', 'tier=' || p_tier || ', code=' || v_code, p_reason, v_email);
  RETURN v_code;
END; $$;

REVOKE ALL ON FUNCTION public.grant_loyalty_tier(uuid, text, text)   FROM anon;
REVOKE ALL ON FUNCTION public.revoke_loyalty_tier(uuid, text)        FROM anon;
REVOKE ALL ON FUNCTION public.reissue_loyalty_code(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_loyalty_tier(uuid, text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_loyalty_tier(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.reissue_loyalty_code(uuid, text, text) TO authenticated;
