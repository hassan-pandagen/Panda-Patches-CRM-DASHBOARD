-- get_current_user_role() returned 'AGENT' to callers with no user_profiles row
-- 2026-09-01 · APPLIED via MCP
--
-- Confirmed live: an UNAUTHENTICATED POST to /rest/v1/rpc/get_current_user_role returned
-- "AGENT". Same for the 583 customer-portal logins, none of which have a user_profiles row.
--
-- Not exploitable when found — no RLS policy referenced it, and its only consumer
-- (get_all_user_profiles_for_admin) compares <> 'ADMIN', which 'AGENT' fails, so anon
-- correctly got []. But it is a loaded gun: 'AGENT' READS like a real role even though the
-- real roles are ADMIN / SALES_AGENT / PRODUCTION / SHIPPING, and the next policy that
-- trusts it hands agent-level access to the public.
--
-- The fallback must NOT be NULL. The existing gate is
--     IF get_current_user_role() <> 'ADMIN' THEN RETURN; END IF;
-- and NULL <> 'ADMIN' evaluates to NULL, which IF treats as FALSE — the guard would be
-- SKIPPED and every staff profile returned to anon. A non-matching sentinel is the safe
-- shape, which is also why get_user_role()'s 'USER' default is deliberately left alone.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 'NONE' matches no real role and is never NULL, so <> / NOT IN guards evaluate TRUE
  -- and correctly deny. Do not return NULL.
  RETURN COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'NONE');
END;
$function$;
