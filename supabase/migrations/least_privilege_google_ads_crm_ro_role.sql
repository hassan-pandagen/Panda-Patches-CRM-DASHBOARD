-- Applied 2026-07-18 via Supabase MCP (remote version: least_privilege_google_ads_crm_ro_role)
-- The google_ads_data_manager_crm_ro role (credentials held by Google Ads Data Manager)
-- had SELECT on every table in public (36/36, incl. payments and user profiles) plus a
-- default-privilege grant handing it every FUTURE table and function. The sibling
-- google_ads_data_manager_ro role reads zero base tables and its connection has synced
-- daily since 2026-07-15 — the export views run with owner privileges, so the Data
-- Manager role only ever needs SELECT on its export relations. Scope it down to exactly
-- that. Instantly reversible with GRANTs if ever needed.

-- 1) Stop auto-granting future objects to the Data Manager role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT ON TABLES FROM google_ads_data_manager_crm_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM google_ads_data_manager_crm_ro;

-- 2) Revoke everything except the Data Manager export relations.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      AND c.relname NOT IN (
        'google_ads_data_manager_export',
        'google_ads_data_manager_export_leads',
        'google_ads_data_manager_export_crm',
        'google_ads_data_manager_export_crm_src',
        'google_ads_data_manager_export_customers')
  LOOP
    IF has_table_privilege('google_ads_data_manager_crm_ro', rec.rel, 'SELECT') THEN
      EXECUTE format('REVOKE ALL ON %s FROM google_ads_data_manager_crm_ro', rec.rel);
    END IF;
  END LOOP;

  FOR rec IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  LOOP
    IF has_sequence_privilege('google_ads_data_manager_crm_ro', rec.rel, 'SELECT') THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM google_ads_data_manager_crm_ro', rec.rel);
    END IF;
  END LOOP;

  -- App RPCs (some SECURITY DEFINER) picked up via the default-privilege grant.
  FOR rec IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname <> 'normalize_phone_e164'
      AND p.prokind IN ('f', 'p')
  LOOP
    IF has_function_privilege('google_ads_data_manager_crm_ro', rec.fn, 'EXECUTE') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM google_ads_data_manager_crm_ro', rec.fn);
    END IF;
  END LOOP;
END $$;
