-- ============================================================================
-- ATOMIC ORDER PAYMENT  (hardening after the PP-11151 lost-update, 2026-07-30)
-- Records a payment against an order with a ROW LOCK + single atomic increment, and
-- bumps updated_at. Replaces the webhook's read-then-write (which could lose a payment to
-- a concurrent write). This is the industry-standard pattern for money: never read-modify-
-- write across a round trip — lock the row and increment in one statement.
--
-- Also handles: payment_status (paid / deposit_paid / unchanged) and releasing a held
-- PENDING_PAYMENT order to NEW_ORDER on first payment — all in the same locked transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_order_payment(p_order_id bigint, p_amount numeric)
  RETURNS TABLE (
    new_amount_paid numeric,
    order_amount numeric,
    new_status text,
    released boolean,
    new_payment_status text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_prev_paid    numeric;
  v_total        numeric;
  v_prev_status  text;
  v_prev_pstatus text;
  v_new_paid     numeric;
  v_fully        boolean;
  v_pstatus      text;
  v_release      boolean;
  v_status       text;
BEGIN
  -- Lock the row for the duration of the transaction so a concurrent write can't interleave.
  SELECT amount_paid, order_amount, status, payment_status
    INTO v_prev_paid, v_total, v_prev_status, v_prev_pstatus
    FROM orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_new_paid := COALESCE(v_prev_paid, 0) + p_amount;
  v_total    := COALESCE(v_total, 0);
  v_fully    := v_total > 0 AND v_new_paid >= v_total - 0.01;
  v_pstatus  := CASE WHEN v_fully THEN 'paid'
                     WHEN v_new_paid > 0 THEN 'deposit_paid'
                     ELSE COALESCE(v_prev_pstatus, 'pending') END;
  -- Release a held "wait for payment" order to production on first payment (deposit is enough).
  v_release  := v_prev_status = 'PENDING_PAYMENT';
  v_status   := CASE WHEN v_release THEN 'NEW_ORDER' ELSE v_prev_status END;

  UPDATE orders
     SET amount_paid    = v_new_paid,
         payment_status = v_pstatus,
         status         = v_status,
         updated_at     = now()          -- bump so optimistic locks see the payment
   WHERE id = p_order_id;

  RETURN QUERY SELECT v_new_paid, v_total, v_status, v_release, v_pstatus;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_payment(bigint, numeric) FROM anon, authenticated;
-- Service role (the webhook) executes this; it bypasses the grant, but keep it locked down.
