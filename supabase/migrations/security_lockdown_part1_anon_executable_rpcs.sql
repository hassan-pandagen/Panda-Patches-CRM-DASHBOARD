-- ============================================================================
-- SECURITY LOCKDOWN — PART 1 of 2 — anon-executable SECURITY DEFINER functions
-- 2026-08-31
--
-- APPLY THIS FIRST. It is safe to run against the currently-deployed frontend:
-- it only removes access no client legitimately uses, and adds a new RPC. Part 2
-- (revoking anon SELECT on payment_form_tokens) must NOT be applied until the
-- frontend change shipping alongside this is live and verified — see the header
-- of that file.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Supabase advisor lint 0028 (anon_security_definer_function_executable) plus
-- confirmation against the live database using the public anon key. The headline
-- case: public.apply_order_payment executed for `anon`. Probed non-destructively
-- with p_order_id = -1, it returned P0001 "Payment amount must be a positive
-- number" — a RAISE from inside the function body, NOT "permission denied". The
-- function has no in-function authorization check (it was written for the
-- service-role webhook), so a well-formed anon call would mark ANY order paid.
-- The anon key ships in the frontend bundle.
--
-- ── The two defects that left it open ───────────────────────────────────────
-- 1. add_apply_order_payment_rpc.sql was never applied (the same migration whose
--    absence caused the 2026-08-19 missing-RPC incident). When the function was
--    rebuilt by restore_apply_order_payment_and_fix_payment_status, the function
--    came back and its REVOKE did not.
--
-- 2. More importantly, that REVOKE would NOT have worked anyway. Every
--    function-level REVOKE in this repo is written as:
--        REVOKE ALL ON FUNCTION f(...) FROM anon, authenticated;
--    Postgres grants EXECUTE on functions to PUBLIC by default, and a role's
--    effective privilege is the UNION of its own grants and PUBLIC's. Revoking
--    from `anon` leaves anon still holding EXECUTE via PUBLIC. **You must revoke
--    from PUBLIC.** All six existing REVOKEs share this defect, so all six are
--    ineffective; they are all corrected below.
--
-- 3. And the comment in that file — "Service role ... bypasses the grant" — is
--    wrong. service_role bypasses ROW-LEVEL SECURITY, not privileges. Revoking
--    from PUBLIC without an explicit GRANT to service_role would break the
--    Square webhook. Every revoke here is therefore paired with explicit grants
--    to exactly the roles that legitimately call it.
--
-- Guarded with to_regprocedure so this is idempotent and tolerates the known
-- drift between supabase/migrations/ and the live schema (e.g.
-- add_loyalty_admin_override.sql has never been applied).
-- ============================================================================

DO $$
DECLARE
  -- fn signature  →  roles that legitimately need EXECUTE
  targets constant text[][] := ARRAY[
    -- Payment application: called ONLY by square-payment-webhook as service_role.
    -- No client path calls it (verified: no reference anywhere in src/).
    ['public.apply_order_payment(bigint, numeric)',        'service_role'],

    -- Staff reporting RPCs: rendered inside authenticated pages.
    -- get_funnel_monthly_trend leaked real business metrics (quotes created,
    -- orders, conversions by month) to anon — confirmed returning live data.
    ['public.get_funnel_monthly_trend(integer)',           'authenticated, service_role'],
    ['public.loyalty_tier_stats()',                        'authenticated, service_role'],
    ['public.review_invitation_stats()',                   'authenticated, service_role'],

    -- Loyalty admin overrides: ADMIN-gated in-function, called from
    -- LoyaltyAdminPanel with the signed-in user's JWT.
    ['public.grant_loyalty_tier(uuid, text, text)',        'authenticated, service_role'],
    ['public.revoke_loyalty_tier(uuid, text)',             'authenticated, service_role'],
    ['public.reissue_loyalty_code(uuid, text, text)',      'authenticated, service_role']
  ];
  sig   text;
  roles text;
  i     int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    sig   := targets[i][1];
    roles := targets[i][2];

    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE 'skip (not in this database): %', sig;
      CONTINUE;
    END IF;

    -- PUBLIC first — this is the one that actually closes the hole.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    -- Then hand EXECUTE back to exactly the roles that need it.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', sig, roles);

    RAISE NOTICE 'locked down %  →  %', sig, roles;
  END LOOP;
END $$;


-- ── payment_form_tokens: a by-token lookup to replace direct anon SELECT ─────
-- Direct anon SELECT on the table let anyone with the anon key enumerate every
-- row — Content-Range reported 0-214/215 with no token filter — exposing 215
-- customers' names, emails, phones, shipping addresses and order values, plus
-- the live tokens themselves.
--
-- The public /pay/:token page only ever needs ONE row BY TOKEN, so the token
-- (an unguessable UUID) becomes the capability.
--
-- Returns ONLY the columns that page renders. Deliberately omitted, because it
-- never used them and they are the sensitive half of the row: `attribution`
-- (client_ip, user agent, fbc/fbp click IDs), `created_by` (staff email address),
-- mockup_urls and customer_attachment_urls. So this is strictly narrower than the
-- select=* it replaces, not the same leak relocated.
--
-- used_at and expires_at ARE returned — the page needs them to render the
-- "already paid" and "link expired" screens instead of the form.
--
-- token compared via ::text so this works whether the column is uuid or text.
CREATE OR REPLACE FUNCTION public.get_payment_form_token(p_token text)
  RETURNS TABLE (
    id               bigint,
    token            text,
    customer_name    text,
    customer_email   text,
    customer_phone   text,
    shipping_address text,
    design_name      text,
    patches_type     text,
    patches_quantity integer,
    design_size      text,
    design_backing   text,
    border_type      text,
    sample_box       boolean,
    country          text,
    purchase_order   text,
    organization     text,
    instructions     text,
    order_amount     numeric,
    is_deposit       boolean,
    deposit_amount   numeric,
    order_number     text,
    used_at          timestamptz,
    expires_at       timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    t.id,
    t.token::text,
    t.customer_name,
    t.customer_email,
    t.customer_phone,
    t.shipping_address,
    t.design_name,
    t.patches_type,
    t.patches_quantity,
    t.design_size,
    t.design_backing,
    t.border_type,
    t.sample_box,
    t.country,
    t.purchase_order,
    t.organization,
    t.instructions,
    t.order_amount,
    t.is_deposit,
    t.deposit_amount,
    t.order_number,
    t.used_at,
    t.expires_at
  FROM public.payment_form_tokens t
  WHERE t.token::text = p_token
  LIMIT 1;
$$;

REVOKE ALL  ON FUNCTION public.get_payment_form_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_form_token(text) TO anon, authenticated, service_role;
