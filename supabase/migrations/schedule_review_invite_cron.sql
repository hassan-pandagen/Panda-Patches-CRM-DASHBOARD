-- ============================================================================
-- SCHEDULE THE REVIEW-INVITE CRON  (MASTER v3, item #1 — FINAL, GATED STEP)
--
-- Run this LAST, and only after:
--   1. add_review_program.sql has been applied (delivered_at + review_invitations), AND
--   2. the `review-invite-cron` edge function is deployed with verify_jwt = false, AND
--   3. its REVIEW_CRON_SECRET secret is set:
--        supabase secrets set REVIEW_CRON_SECRET=$(openssl rand -hex 32)
--
-- Requires Supabase Pro (pg_cron + pg_net). This is the only piece that actually
-- starts sending, which is why it is isolated in its own migration.
-- ============================================================================

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2) Store the values the job needs in Vault (secrets never live in this file).
--    Fill these in via the SQL editor ONCE, then delete the literals from your history.
--    - project_url        e.g. https://<your-ref>.supabase.co   (no trailing slash)
--    - review_cron_secret the SAME value you set as REVIEW_CRON_SECRET on the function
--    The service-role key is REUSED from the existing `service_role_jwt` Vault secret
--    (already present for the Square webhooks) — do not create a duplicate.
--
--    select vault.create_secret('https://<your-ref>.supabase.co', 'project_url');
--    select vault.create_secret('<review_cron_secret>',           'review_cron_secret');
--
--    (To rotate later: select vault.update_secret(id, '<new value>') — look up id in vault.secrets.)

-- 3) Schedule: once daily at 15:00 UTC (~9–10am US Central — a sane hour to land a
--    "how did they turn out?" note). Adjust the cron expression for your timezone.
--    The function itself decides who is actually due (2–5 days post-delivery, one
--    reminder at +5 days), so the schedule only needs to fire once a day.
select cron.schedule(
  'review-invite-daily',
  '0 15 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/review-invite-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_jwt'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'review_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify:   select * from cron.job where jobname = 'review-invite-daily';
-- Inspect:  select * from cron.job_run_details order by start_time desc limit 10;
-- Unschedule (rollback / pause sending):
--           select cron.unschedule('review-invite-daily');
