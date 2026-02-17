-- ============================================
-- AUTO CLOCK-OUT CRON JOB
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
--
-- REQUIRES: Supabase Pro plan (pg_cron extension)
-- If on Free plan, the client-side auto clock-out in ClockInOutPage
-- will continue to work as a fallback.
-- ============================================

-- Step 1: Enable pg_cron extension (Pro plan only)
-- Uncomment the line below when on Supabase Pro:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Drop old version (return type changed from old version to jsonb)
DROP FUNCTION IF EXISTS auto_close_stale_sessions();

-- Step 3: Create the auto clock-out function
CREATE OR REPLACE FUNCTION auto_close_stale_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  closed_count integer := 0;
BEGIN
  -- Close all sessions that have been open for more than 10 hours
  -- Sets clock_out_time to 10 hours after clock_in_time
  -- Marks them as auto_clocked_out for admin visibility
  WITH stale AS (
    UPDATE attendance_sessions
    SET
      clock_out_time = clock_in_time + INTERVAL '10 hours',
      duration_hours = 10.0,
      auto_clocked_out = true
    WHERE
      clock_out_time IS NULL
      AND clock_in_time < NOW() - INTERVAL '10 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO closed_count FROM stale;

  RETURN jsonb_build_object('sessions_closed', closed_count);
END;
$$;

-- Step 3: Schedule the cron job (Pro plan only)
-- Runs every 30 minutes to catch stale sessions
-- Uncomment the lines below when on Supabase Pro:
--
-- SELECT cron.schedule(
--   'auto-clockout-stale-sessions',  -- job name
--   '*/30 * * * *',                   -- every 30 minutes
--   $$SELECT auto_close_stale_sessions()$$
-- );

-- To verify the job is scheduled (after enabling):
-- SELECT * FROM cron.job;

-- To remove the job if needed:
-- SELECT cron.unschedule('auto-clockout-stale-sessions');
