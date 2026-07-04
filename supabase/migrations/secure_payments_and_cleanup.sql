-- Security hardening from the 2026-07-02 audit.
-- Run this in the Supabase SQL editor. Safe to run once; idempotent.

-- ─────────────────────────────────────────────────────────────────────────────
-- #2  Drop the unused, unsafe get_orders_paginated RPC.
-- It is SECURITY DEFINER (bypasses RLS) yet gated rows on a CLIENT-SUPPLIED role
-- parameter, so any user could pass p_user_role => 'ADMIN' and read every order.
-- It is not referenced anywhere in the frontend, so dropping it removes the hole
-- outright. (No args needed — the name is unambiguous.)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_orders_paginated;


-- ─────────────────────────────────────────────────────────────────────────────
-- #3  Atomic, authorized, validated manual-payment recording.
-- Replaces the browser writing orders.amount_paid directly. Fixes:
--   • lost-update race (two agents, or agent + Square webhook, at once) — the row
--     is locked and the amount is INCREMENTED server-side, not overwritten.
--   • no server-side over-payment guard (was client-only).
--   • no permission check on the write path.
--   • the entered payment date was never saved — now captured in the audit row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_order_id  BIGINT,
  p_amount    NUMERIC,
  p_method    TEXT DEFAULT 'other',
  p_reference TEXT DEFAULT NULL,
  p_paid_at   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email TEXT;
  v_order        RECORD;
  v_new_paid     NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be a positive number';
  END IF;

  v_caller_email := public.get_user_email();

  -- Lock the row so concurrent payments serialize instead of clobbering each other.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Only an admin, a financial editor, or the order's own sales agent may record a payment.
  IF NOT (
    public.is_admin()
    OR public.has_permission('orders_edit_financials')
    OR v_order.sales_agent = v_caller_email
  ) THEN
    RAISE EXCEPTION 'Not authorized to record payments on this order';
  END IF;

  IF v_order.status IN ('CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Cannot record a payment on a cancelled or refunded order';
  END IF;

  v_new_paid := COALESCE(v_order.amount_paid, 0) + p_amount;

  -- Server-side over-payment guard (the client check is advisory only).
  IF v_new_paid > COALESCE(v_order.order_amount, 0) + 0.01 THEN
    RAISE EXCEPTION 'Payment $% exceeds the remaining balance (total $%, already paid $%)',
      p_amount, COALESCE(v_order.order_amount, 0), COALESCE(v_order.amount_paid, 0);
  END IF;

  -- Normal UPDATE so the existing status / CAPI triggers still fire.
  UPDATE public.orders SET amount_paid = v_new_paid WHERE id = p_order_id;

  INSERT INTO public.order_history (order_id, user_email, field_changed, old_value, new_value)
  VALUES (
    p_order_id,
    COALESCE(v_caller_email, 'system'),
    'manual_payment',
    '$' || to_char(COALESCE(v_order.amount_paid, 0), 'FM999999990.00'),
    '$' || to_char(v_new_paid, 'FM999999990.00')
      || ' (via ' || COALESCE(p_method, 'other')
      || CASE WHEN p_reference IS NOT NULL AND length(btrim(p_reference)) > 0
              THEN ' ref: ' || p_reference ELSE '' END
      || CASE WHEN p_paid_at IS NOT NULL
              THEN ' on ' || to_char(p_paid_at, 'YYYY-MM-DD') ELSE '' END
      || ')'
  );

  RETURN jsonb_build_object(
    'order_id',     p_order_id,
    'amount_paid',  v_new_paid,
    'order_amount', v_order.order_amount,
    'fully_paid',   v_new_paid >= COALESCE(v_order.order_amount, 0)
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.record_manual_payment(BIGINT, NUMERIC, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_manual_payment(BIGINT, NUMERIC, TEXT, TEXT, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
