-- ============================================================================
-- set_order_delivered_at — two fixes, applied 2026-09-06.
--
-- 1. IT NEVER SET delivery_source. That column was added earlier the same day and
--    rush_turnaround_by_type() filters on delivery_source IN ('carrier_manual',
--    'status_change'). The trigger kept stamping delivered_at and leaving the source
--    NULL, so every order delivered from that point would have been SILENTLY EXCLUDED
--    from the turnaround table. The table would just stop growing, with nothing to say
--    why — exactly the failure the provenance column was added to prevent. Caught by
--    the owner asking whether delivered_at is tracked on status change.
--
-- 2. A REAL DELIVERY NOW OVERRIDES AN ESTIMATE. The old guard was
--    `delivered_at IS NULL`, so an order carrying a bulk-close guess or an
--    email-derived backfill could never be corrected by someone actually marking it
--    Delivered — the worse date won permanently. A status change now replaces a date
--    already labelled untrustworthy, and still never touches a carrier-verified date
--    or an earlier genuine status change.
--
-- Verified, four cases in a rolled-back transaction:
--   fresh delivery      -> status_change, dated today, estimated=false
--   bulk_estimate       -> replaced with today's date, source status_change
--   carrier_manual      -> preserved (2026-01-15 untouched)
--   earlier status_change -> preserved (2026-02-02 untouched)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'DELIVERED' AND (
       NEW.delivered_at IS NULL
       OR NEW.delivery_source IN ('bulk_estimate', 'email_backfill')
     )
  THEN
    NEW.delivered_at           := now();
    NEW.delivery_source        := 'status_change';
    NEW.delivered_at_estimated := false;
  END IF;
  RETURN NEW;
END;
$function$;
