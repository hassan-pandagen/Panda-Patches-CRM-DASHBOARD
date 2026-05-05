-- Stripe Payment Link generation via pg_net (Postgres-side, no Edge Functions).
--
-- Why move OFF Edge Functions for this?
-- We hit persistent gateway 502s on create-stripe-checkout despite multiple SDK
-- rewrites and runtime version pins. Rather than continue debugging the runtime,
-- we sidestep it: Postgres has built-in HTTP via pg_net, secrets live in Vault,
-- and we eliminate the Deno failure surface. This is the architecture
-- HubSpot/Pipedrive/Close use for agent-generated payment links.
--
-- Stripe v1 API requires application/x-www-form-urlencoded. pg_net 0.20+
-- serializes JSONB body to form-encoded pairs when that Content-Type is set.
-- We pass Stripe params using bracket notation as flat top-level JSONB keys.

CREATE SCHEMA IF NOT EXISTS private;

-- ── Vault secret accessor ─────────────────────────────────────────────────
-- User must add the Stripe key to Vault separately (see post-migration steps).
CREATE OR REPLACE FUNCTION private.get_stripe_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'stripe_secret_key'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Stripe secret not found in vault. Run: SELECT vault.create_secret(''sk_live_...'', ''stripe_secret_key'');';
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION private.get_stripe_secret() FROM PUBLIC, authenticated, anon;

-- ── Main RPC: create_stripe_payment_link ──────────────────────────────────
-- Uses Stripe Payment Links API (reusable shareable URLs — perfect for
-- "agent shares link, customer pays later via WhatsApp/Email" flow).
-- Metadata propagates to the Checkout Session created when the customer pays,
-- which our existing stripe-balance-webhook reads to update amount_paid.

CREATE OR REPLACE FUNCTION public.create_stripe_payment_link(
  p_order_id BIGINT,
  p_amount NUMERIC DEFAULT NULL,
  p_label TEXT DEFAULT 'custom'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, net, extensions
AS $$
DECLARE
  v_order RECORD;
  v_user_id UUID;
  v_is_staff BOOLEAN := FALSE;
  v_is_customer BOOLEAN := FALSE;
  v_caller_email TEXT;
  v_remaining NUMERIC;
  v_charge_amount NUMERIC;
  v_stripe_key TEXT;
  v_request_id BIGINT;
  v_response_status INT;
  v_response_content TEXT;
  v_response_body JSONB;
  v_attempts INT := 0;
  v_max_attempts INT := 30; -- 30 * 200ms = 6s max wait
  v_label_text TEXT;
  v_product_name TEXT;
  v_idempotency_key TEXT;
  v_success_url TEXT;
  v_origin TEXT;
  v_form_body TEXT;
BEGIN
  -- ── Identify caller ─────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_caller_email FROM user_profiles WHERE id = v_user_id;
  IF FOUND THEN
    v_is_staff := TRUE;
  ELSE
    SELECT email INTO v_caller_email FROM customer_profiles WHERE id = v_user_id;
    IF FOUND THEN
      v_is_customer := TRUE;
    END IF;
  END IF;

  IF NOT (v_is_staff OR v_is_customer) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ── Load order ──────────────────────────────────────────────
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- ── Customer authorization: must own the order ──────────────
  IF v_is_customer THEN
    IF LOWER(v_caller_email) NOT IN (
      LOWER(COALESCE(v_order.customer_email, '')),
      LOWER(COALESCE(v_order.cc_email, ''))
    ) THEN
      RAISE EXCEPTION 'Not authorized to pay this order';
    END IF;
  END IF;

  -- ── Validate balance ────────────────────────────────────────
  v_remaining := COALESCE(v_order.order_amount, 0) - COALESCE(v_order.amount_paid, 0);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'This order is already fully paid';
  END IF;

  IF v_order.status IN ('CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Cannot create payment link for a cancelled/refunded order';
  END IF;

  -- ── Determine charge amount ─────────────────────────────────
  v_charge_amount := v_remaining;
  IF v_is_staff AND p_amount IS NOT NULL THEN
    IF p_amount > v_remaining + 0.01 THEN
      RAISE EXCEPTION 'Amount $% exceeds remaining balance $%', p_amount, v_remaining;
    END IF;
    v_charge_amount := p_amount;
  END IF;

  -- ── Build product name + label ─────────────────────────────
  IF v_order.patches_quantity IS NOT NULL AND v_order.design_name IS NOT NULL THEN
    v_product_name := COALESCE(v_order.patches_type, 'Patches')
      || ' x ' || v_order.patches_quantity
      || ' (' || v_order.design_name || ')';
  ELSE
    v_product_name := 'Order ' || v_order.order_number;
  END IF;

  v_label_text := CASE p_label
    WHEN 'deposit' THEN ' - Deposit Payment'
    WHEN 'balance' THEN ' - Balance Payment'
    WHEN 'full' THEN ''
    ELSE CASE WHEN v_charge_amount < v_remaining - 0.01 THEN ' - Partial Payment' ELSE '' END
  END;

  v_origin := CASE WHEN v_is_staff THEN 'crm_agent' ELSE 'customer_portal' END;

  v_success_url := CASE WHEN v_is_staff
    THEN 'https://portal.pandapatches.com/order/' || v_order.order_number || '?paid=1'
    ELSE 'https://login.pandapatches.com/customer/order/' || v_order.order_number || '?paid=1'
  END;

  v_stripe_key := private.get_stripe_secret();
  v_idempotency_key := 'order_' || v_order.id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

  -- ── Call Stripe Payment Links API ──────────────────────────
  -- Stripe v1 requires application/x-www-form-urlencoded. pg_net's http_post()
  -- raises an exception on non-JSON Content-Type, so we insert directly into
  -- net.http_request_queue (bytea body column accepts raw form-encoded bytes).
  v_form_body :=
    'line_items[0][price_data][currency]=usd'
    || '&line_items[0][price_data][product_data][name]=' || net._urlencode_string(v_product_name || v_label_text)
    || '&line_items[0][price_data][unit_amount]=' || (ROUND(v_charge_amount * 100))::TEXT
    || '&line_items[0][quantity]=1'
    || '&metadata[order_id]=' || v_order.id::TEXT
    || '&metadata[order_number]=' || net._urlencode_string(COALESCE(v_order.order_number, ''))
    || '&metadata[payment_kind]=' || net._urlencode_string(p_label)
    || '&metadata[capi_event_id]=order_' || v_order.id::TEXT || '_purchase'
    || '&metadata[origin]=' || v_origin
    || '&metadata[fbp]=' || net._urlencode_string(COALESCE(v_order.attribution->>'fbp', ''))
    || '&metadata[fbc]=' || net._urlencode_string(COALESCE(v_order.attribution->>'fbc', ''))
    || '&after_completion[type]=redirect'
    || '&after_completion[redirect][url]=' || net._urlencode_string(v_success_url);

  INSERT INTO net.http_request_queue(method, url, headers, body, timeout_milliseconds)
  VALUES (
    'POST',
    'https://api.stripe.com/v1/payment_links',
    jsonb_build_object(
      'Authorization', 'Bearer ' || v_stripe_key,
      'Content-Type', 'application/x-www-form-urlencoded',
      'Idempotency-Key', v_idempotency_key
    ),
    convert_to(v_form_body, 'UTF8'),
    8000
  )
  RETURNING id INTO v_request_id;

  PERFORM net.wake();

  -- ── Wait for response ──────────────────────────────────────
  LOOP
    SELECT status_code, content
    INTO v_response_status, v_response_content
    FROM net._http_response
    WHERE id = v_request_id;

    EXIT WHEN v_response_status IS NOT NULL;

    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Stripe API timeout after % attempts (request_id %)', v_max_attempts, v_request_id;
    END IF;

    PERFORM pg_sleep(0.2);
  END LOOP;

  v_response_body := v_response_content::JSONB;

  IF v_response_status >= 400 THEN
    RAISE EXCEPTION 'Stripe error (HTTP %): %',
      v_response_status,
      COALESCE(v_response_body->'error'->>'message', v_response_content);
  END IF;

  -- ── Log to order_history for audit ─────────────────────────
  INSERT INTO order_history (order_id, user_email, field_changed, old_value, new_value)
  VALUES (
    v_order.id,
    CASE WHEN v_is_staff THEN v_caller_email ELSE 'customer_portal' END,
    'stripe_payment_link',
    '',
    'Generated $' || v_charge_amount::TEXT || ' ' || p_label || ' link (' || (v_response_body->>'id') || ')'
  );

  RETURN jsonb_build_object(
    'url', v_response_body->>'url',
    'payment_link_id', v_response_body->>'id',
    'session_id', v_response_body->>'id',
    'amount', v_charge_amount,
    'order_number', v_order.order_number,
    'customer_email', v_order.customer_email,
    'customer_name', v_order.customer_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stripe_payment_link(BIGINT, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
