-- Production completion packet photos.
-- When production marks an order complete they may attach up to a few photos of the
-- finished product ("completion packet"). These are stored on the order and emailed
-- internally to the production office. No financial data is ever exposed to production.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_completion_photos text[] NOT NULL DEFAULT '{}';

-- Drop the old single-arg signature so the new defaulted-arg version isn't ambiguous
-- when called with a single bigint.
DROP FUNCTION IF EXISTS public.mark_production_done(bigint);

CREATE OR REPLACE FUNCTION public.mark_production_done(
  p_order_id bigint,
  p_completion_photos text[] DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := get_user_role();
  v_email text := get_user_email();
  v_order_number text;
  v_sales_agent text;
  v_already timestamptz;
  v_recipient_id uuid;
BEGIN
  IF v_role NOT IN ('PRODUCTION', 'ADMIN') THEN
    RAISE EXCEPTION 'Only production or admin can mark production done';
  END IF;

  SELECT order_number, sales_agent, production_completed_at
    INTO v_order_number, v_sales_agent, v_already
  FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RAISE EXCEPTION 'Order % already marked production complete', v_order_number;
  END IF;

  UPDATE orders
     SET production_completed_at = NOW(),
         production_completed_by = v_email,
         production_completion_photos = COALESCE(p_completion_photos, '{}')
   WHERE id = p_order_id;

  -- Notify assigned sales agent (if any) + all admins via bell
  FOR v_recipient_id IN
    SELECT id FROM user_profiles
     WHERE role = 'ADMIN'
        OR (v_sales_agent IS NOT NULL AND email = v_sales_agent)
  LOOP
    INSERT INTO activity_notifications (recipient_id, type, title, body, link, related_order_id)
    VALUES (
      v_recipient_id,
      'production_complete',
      'Production complete on order ' || v_order_number,
      'Marked by ' || v_email,
      '/order/' || v_order_number,
      p_order_id
    );
  END LOOP;
END;
$function$;
