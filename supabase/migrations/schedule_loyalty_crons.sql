-- ============================================================================
-- SCHEDULE THE LOYALTY CRONS  (CL86F1 — FINAL, GATED STEP)
--
-- Run LAST, after:
--   1. add_loyalty_program.sql applied, AND
--   2. loyalty-email-cron deployed (verify_jwt = false), AND
--   3. its secret set:  supabase secrets set LOYALTY_CRON_SECRET=$(openssl rand -hex 32)
--
-- pg_cron + pg_net are already enabled (review program). Vault already holds
-- `project_url` and `service_role_jwt`; you only add `loyalty_cron_secret` below.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add the loyalty cron secret to Vault (must EQUAL the function's LOYALTY_CRON_SECRET):
--   select vault.create_secret('<loyalty_cron_secret>', 'loyalty_cron_secret');

-- 1) Nightly tier reconciliation (safety net for refunds/edge cases; the orders trigger
--    already recomputes in real time). Pure SQL — no HTTP needed. 07:00 UTC.
select cron.schedule(
  'loyalty-reconcile-nightly',
  '0 7 * * *',
  $$ select public.recompute_all_loyalty(); $$
);

-- 2) Daily loyalty emails (awards E1–E3, expiry E4, nudges E5). 16:00 UTC.
select cron.schedule(
  'loyalty-email-daily',
  '0 16 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/loyalty-email-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'loyalty_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify:    select jobname, schedule, active from cron.job where jobname like 'loyalty-%';
-- Unschedule: select cron.unschedule('loyalty-reconcile-nightly');
--             select cron.unschedule('loyalty-email-daily');
