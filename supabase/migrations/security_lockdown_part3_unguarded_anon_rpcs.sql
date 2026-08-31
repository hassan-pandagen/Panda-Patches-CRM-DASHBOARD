-- ============================================================================
-- SECURITY LOCKDOWN — PART 3 of 3 — unguarded anon-executable SECURITY DEFINER fns
-- 2026-08-31 · APPLIED via MCP the same day · follows parts 1 and 2
--
-- Parts 1/2 closed the critical exposures. This closes every remaining SECURITY
-- DEFINER function that `anon` could execute AND that carries no in-function
-- authorization check of any kind. Identified with:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.prosecdef and p.prokind='f'
--     and has_function_privilege('anon', p.oid, 'EXECUTE')
--     and pg_get_function_result(p.oid) <> 'trigger'
--     and p.prosrc !~* '(is_admin|is_super_admin|has_permission|get_user_role|
--                        get_current_user_role|auth\.uid|auth\.jwt|RAISE EXCEPTION)';
--
-- Keep that query. Re-run it after adding any SECURITY DEFINER function; the only
-- row it should ever return is get_payment_form_token.
--
-- Worst of these before the fix:
--   • recompute_all_loyalty()      full-table recompute, callable repeatedly by
--                                  anyone = trivial database resource exhaustion
--   • use_gold_rush_upgrade()      consumes a customer's Gold quarterly rush perk
--   • auto_close_stale_sessions()  force-closes staff clock-in sessions
--   • get_attendance_stats()       reads any staff member's timesheet by uuid
--
-- Grantees derived from real call sites, not assumed:
--   authenticated → has a frontend caller, or is staff-domain (removing `anon` is
--                   the security win; signed-in staff are trusted)
--   service_role  → called by an edge function's admin client, or by pg_cron
--
-- NOT touched: public.get_payment_form_token(text) — deliberately anon-executable
-- and deliberately unguarded; the unguessable token IS the capability (part 1).
--
-- Trigger paths unaffected: firing a trigger does not check EXECUTE, and these are
-- reached from SECURITY DEFINER trigger functions whose checks run as the definer.
-- ============================================================================

DO $$
DECLARE
  targets constant text[][] := ARRAY[
    -- called only by edge functions holding the service-role client
    ['public.append_capi_lead_event(bigint, jsonb)',        'service_role'],   -- send-meta-lead-event
    ['public.increment_conversation_unread(bigint)',        'service_role'],   -- meta-webhook

    -- attendance: ClockInOutPage.tsx:200 calls auto_close_stale_sessions with a user JWT
    ['public.auto_close_stale_sessions()',                  'authenticated, service_role'],
    ['public.calculate_daily_attendance(uuid, date)',       'authenticated, service_role'],
    ['public.get_attendance_stats(uuid, date, date)',       'authenticated, service_role'],
    ['public.get_work_date(timestamp with time zone)',      'authenticated, service_role'],

    -- loyalty engine: pg_cron + SECURITY DEFINER triggers
    ['public.recompute_all_loyalty()',                      'authenticated, service_role'],
    ['public.recompute_customer_loyalty(uuid)',             'authenticated, service_role'],
    ['public.gold_rush_available(uuid)',                    'authenticated, service_role'],
    ['public.use_gold_rush_upgrade(uuid, bigint)',          'authenticated, service_role'],

    -- staff notification helper (both overloads)
    ['public.notify_admin_of_revision_loop(integer, text)', 'authenticated, service_role'],
    ['public.notify_admin_of_revision_loop(bigint, text)',  'authenticated, service_role']
  ];
  sig text; roles text; i int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    sig := targets[i][1]; roles := targets[i][2];
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE 'skip (not in this database): %', sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', sig, roles);
    RAISE NOTICE 'locked down %  ->  %', sig, roles;
  END LOOP;
END $$;
