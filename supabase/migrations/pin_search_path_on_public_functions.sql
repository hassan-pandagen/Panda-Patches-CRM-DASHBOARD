-- Pin search_path on every public function that lacked it (advisor lint 0011)
-- 2026-09-01 · APPLIED via MCP · 54 functions pinned
--
-- Without an explicit search_path a function resolves unqualified names using the CALLER's
-- search_path. For SECURITY DEFINER functions (8 of the 54) that is privilege escalation:
-- shadow a referenced table from a schema earlier in the path and your version runs with the
-- definer's rights.
--
-- "public, pg_temp" rather than Supabase's documented empty string — the empty form needs
-- every reference schema-qualified, which these bodies are not. Naming pg_temp LAST is the
-- actual hardening: Postgres searches the temp schema FIRST unless placed explicitly, and
-- creating temp objects is the one shadowing route a plain authenticated user has.
--
-- Verified before applying: 0 of the 54 reference net./vault./extensions./cron. objects, so
-- nothing depended on a wider path. ALTER FUNCTION ... SET is metadata only.
--
-- EXTENSION-OWNED FUNCTIONS ARE SKIPPED (deptype 'e'). pg_trgm is installed into public
-- (the separate extension_in_public warning), so gtrgm_in/gtrgm_out live here but belong to
-- the extension — ALTER fails with 42501 "must be owner of function gtrgm_in". 31 such
-- functions stay flagged by the linter; that is expected. Relocating pg_trgm would require
-- dropping and rebuilding every trigram index, which is not worth it for a lint.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'pinned search_path on % functions', n;
END $$;
