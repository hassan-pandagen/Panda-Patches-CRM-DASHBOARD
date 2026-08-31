-- ============================================================================
-- SECURITY LOCKDOWN — PART 5 — staff-scope the `authenticated` RPC surface
-- 2026-08-31 · APPLIED via MCP the same day · follows parts 1–4
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- `authenticated` is NOT "staff". customer_profiles is 1:1 with the portal's
-- auth.users, so that role covers 583 portal customers alongside 12 staff. Parts
-- 1–3 closed anon; these staff-domain SECURITY DEFINER functions were still
-- callable by any signed-in CUSTOMER, with no staff gate and no auth.uid()
-- self-scoping:
--
--   use_gold_rush_upgrade(p_customer_id, p_order_id)  takes the customer id as a
--       PARAMETER with no self-check — one customer could burn another's Gold perk
--   recompute_all_loyalty()        full-table recompute, repeatable = DB exhaustion
--   get_attendance_stats(uuid,…)   read any staff member's timesheet
--   calculate_daily_attendance()   write attendance rows for any user
--   auto_close_stale_sessions()    force-close staff clock-ins
--   notify_admin_of_revision_loop  spam staff notifications (both overloads)
--   recompute_customer_loyalty(uuid), gold_rush_available(uuid)
--
-- ── Safety checks done before revoking ──────────────────────────────────────
--   • website repo (panda-patches-ecommerce) makes ZERO .rpc() calls of any kind
--   • CRM: the only live frontend caller among these is auto_close_stale_sessions,
--     from src/pages/ClockInOutPage.tsx:200
--   • cron.job inspected: jobid=2 runs `select public.recompute_all_loyalty();`
--     directly as username `postgres`. The function OWNER keeps its own grant
--     through these revokes (verified has_function_privilege('postgres',…)=true,
--     and the job was executed successfully afterwards), so the 07:00 UTC nightly
--     loyalty reconciliation is unaffected.
--   • NOTE: there is NO pg_cron job for stale-attendance auto-close. Only 4 jobs
--     exist. FUTURE_UPGRADE_auto_clockout_cron.sql was never applied, so the
--     client-side call from ClockInOutPage is the only mechanism today.
--
-- Trigger paths unaffected: firing a trigger does not check EXECUTE, and these are
-- reached from SECURITY DEFINER functions whose checks run as the definer.
--
-- Deliberately left with `authenticated`:
--   get_payment_form_token(text)      — the unguessable token IS the capability (part 1)
--   get_work_date(timestamptz)        — pure date arithmetic, touches no data
-- ============================================================================

-- auto_close_stale_sessions keeps `authenticated` (ClockInOutPage calls it), so it
-- gets an in-function staff gate instead. Raises rather than silently no-op'ing: a
-- customer reaching this is a real error and should be loud, and the only caller is
-- a staff-only CRM route. Body otherwise byte-identical to the original.
CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can close stale attendance sessions';
  END IF;

  UPDATE public.attendance_sessions
  SET clock_out_time = clock_in_time + interval '10 hours', auto_clocked_out = TRUE
  WHERE clock_out_time IS NULL AND clock_in_time < (now() - interval '10 hours');
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'sessions_closed', affected_count, 'closed_at', now());
END;$function$;

REVOKE ALL    ON FUNCTION public.auto_close_stale_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_sessions() TO authenticated, service_role;

-- everything else: no frontend caller anywhere, so service_role only
DO $$
DECLARE
  sigs constant text[] := ARRAY[
    'public.calculate_daily_attendance(uuid, date)',
    'public.get_attendance_stats(uuid, date, date)',
    'public.notify_admin_of_revision_loop(integer, text)',
    'public.notify_admin_of_revision_loop(bigint, text)',
    'public.recompute_all_loyalty()',
    'public.recompute_customer_loyalty(uuid)',
    'public.use_gold_rush_upgrade(uuid, bigint)',
    'public.gold_rush_available(uuid)'
  ];
  sig text;
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE 'skip (not in this database): %', sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    RAISE NOTICE 'service_role only: %', sig;
  END LOOP;
END $$;
