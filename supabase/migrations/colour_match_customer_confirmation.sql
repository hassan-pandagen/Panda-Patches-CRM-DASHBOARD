-- ============================================================================
-- Colour-match item 5 — supervisor queue, customer confirmation, chase timers
-- 4 Sept 2026. Builds on colour_match_gate.sql.
--
-- ── The one invariant this must not break ───────────────────────────────────
-- The gate is still `matched_yarn`, and nothing here relaxes it. In particular
-- the SUPERVISOR'S PROPOSAL IS NOT THE MATCH: it lands in colour_proposed_yarn,
-- which the trigger does not look at. For a 'needs-customer-confirmation' order
-- the only thing that ever writes matched_yarn is the customer saying yes.
--
-- If the email service is down, no proposal reaches the customer, no customer
-- approves, matched_yarn stays empty, and production stays blocked. The failure
-- direction is correct by construction rather than by a check somewhere.
--
-- The 24h reminder and the 48h agent follow-up NEVER write matched_yarn. They
-- only stamp their own columns and send. Nothing in this file auto-proceeds.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS colour_proposed_yarn        text,
  ADD COLUMN IF NOT EXISTS colour_confirm_token        uuid,
  ADD COLUMN IF NOT EXISTS colour_email_sent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS colour_reminder_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS colour_followup_flagged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS colour_customer_response    text,
  ADD COLUMN IF NOT EXISTS colour_customer_responded_at timestamptz;

COMMENT ON COLUMN public.orders.colour_proposed_yarn IS
  'Supervisor''s closest match, sent to the customer. NOT the gate — matched_yarn is.';
COMMENT ON COLUMN public.orders.colour_confirm_token IS
  'Unguessable capability for the public /colour-match/:token page. The URL is the credential.';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_colour_customer_response_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_colour_customer_response_check
  CHECK (colour_customer_response IS NULL
         OR colour_customer_response IN ('approved', 'changes_requested'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_colour_confirm_token
  ON public.orders (colour_confirm_token) WHERE colour_confirm_token IS NOT NULL;

-- ── Supervisor proposes a match (staff only) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.propose_colour_match(p_order_id bigint, p_yarn text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role  text;
  _token uuid;
BEGIN
  IF coalesce(btrim(p_yarn), '') = '' THEN
    RAISE EXCEPTION 'A proposed yarn is required.' USING ERRCODE = 'check_violation';
  END IF;

  -- Positive allowlist, default deny — a role added later gets nothing until named here.
  SELECT role INTO _role FROM user_profiles WHERE id = auth.uid();
  IF coalesce(_role, 'NONE') NOT IN ('ADMIN', 'PRODUCTION_SUPERVISOR') THEN
    RAISE EXCEPTION 'Only a production supervisor or admin can propose a colour match.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reuse an existing token so a re-send keeps any link already in the customer's inbox alive.
  SELECT colour_confirm_token INTO _token FROM orders WHERE id = p_order_id;
  IF _token IS NULL THEN
    _token := gen_random_uuid();
  END IF;

  UPDATE orders
     SET colour_proposed_yarn = btrim(p_yarn),
         colour_confirm_token = _token,
         -- A fresh proposal reopens the question: clear the previous answer and the
         -- chase stamps so the 24h/48h timers restart from this send.
         colour_customer_response     = NULL,
         colour_customer_responded_at = NULL,
         colour_email_sent_at         = NULL,
         colour_reminder_sent_at      = NULL,
         colour_followup_flagged_at   = NULL
   WHERE id = p_order_id
     AND colour_match_required IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % is not a colour-match order.', p_order_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN _token;
END;
$function$;

REVOKE ALL  ON FUNCTION public.propose_colour_match(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_colour_match(bigint, text) TO authenticated, service_role;

-- ── What the public confirm page may read ───────────────────────────────────
-- Deliberately narrow: no customer name, no email, no address, no money, no
-- sales agent, no attribution. The person holding the link already knows who
-- they are; the page only has to show them what they typed and what we propose.
CREATE OR REPLACE FUNCTION public.get_colour_match_token(p_token text)
RETURNS TABLE (
  order_number          text,
  design_name           text,
  patches_quantity      integer,
  patches_type          text,
  customer_colour_input text,
  customer_colour_hex   text,
  colour_proposed_yarn  text,
  colour_customer_response text,
  colour_customer_responded_at timestamptz,
  matched_yarn          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.order_number, o.design_name, o.patches_quantity, o.patches_type,
         o.customer_colour_input, o.customer_colour_hex, o.colour_proposed_yarn,
         o.colour_customer_response, o.colour_customer_responded_at, o.matched_yarn
    FROM public.orders o
   WHERE o.colour_confirm_token::text = p_token
   LIMIT 1;
$function$;

REVOKE ALL  ON FUNCTION public.get_colour_match_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_colour_match_token(text) TO anon, authenticated, service_role;

-- ── The customer's answer ───────────────────────────────────────────────────
-- This is the ONLY path by which an unauthenticated caller can open the gate, and
-- it can only ever copy colour_proposed_yarn across. It cannot set an arbitrary
-- yarn, cannot act without a proposal on the row, and cannot overwrite an answer
-- that has already been given.
CREATE OR REPLACE FUNCTION public.respond_to_colour_match(p_token text, p_approved boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _row orders%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM orders WHERE colour_confirm_token::text = p_token;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Idempotent: a second click on the same link reports the standing answer
  -- rather than flipping it.
  IF _row.colour_customer_response IS NOT NULL THEN
    RETURN _row.colour_customer_response;
  END IF;

  IF coalesce(btrim(_row.colour_proposed_yarn), '') = '' THEN
    RETURN 'no_proposal';
  END IF;

  IF p_approved THEN
    UPDATE orders
       SET matched_yarn = _row.colour_proposed_yarn,   -- the proposal, never free input
           colour_customer_response = 'approved',
           colour_customer_responded_at = now()
     WHERE id = _row.id;
    RETURN 'approved';
  END IF;

  -- Declined: the proposal is withdrawn and the gate stays shut. A supervisor
  -- proposes again, which issues a fresh question on the same link.
  UPDATE orders
     SET colour_proposed_yarn = NULL,
         colour_customer_response = 'changes_requested',
         colour_customer_responded_at = now()
   WHERE id = _row.id;
  RETURN 'changes_requested';
END;
$function$;

REVOKE ALL  ON FUNCTION public.respond_to_colour_match(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_colour_match(text, boolean) TO anon, authenticated, service_role;

-- ── What the hourly chase job picks up ──────────────────────────────────────
-- Read-only. It returns work; it never advances anything itself.
CREATE OR REPLACE FUNCTION public.colour_match_chase_queue()
RETURNS TABLE (
  id bigint, order_number text, customer_email text, customer_name text,
  sales_agent text, design_name text, patches_quantity integer,
  customer_colour_input text, colour_proposed_yarn text,
  colour_confirm_token uuid, action text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.id, o.order_number, o.customer_email, o.customer_name,
         o.sales_agent, o.design_name, o.patches_quantity,
         o.customer_colour_input, o.colour_proposed_yarn, o.colour_confirm_token,
         CASE
           WHEN o.colour_reminder_sent_at IS NULL
                AND o.colour_email_sent_at < now() - interval '24 hours' THEN 'reminder'
           ELSE 'followup'
         END AS action
    FROM public.orders o
   WHERE o.colour_match_required IS TRUE
     AND o.colour_match_status = 'needs-customer-confirmation'
     AND o.colour_customer_response IS NULL
     AND coalesce(btrim(o.matched_yarn), '') = ''
     AND o.colour_email_sent_at IS NOT NULL
     AND o.deleted_at IS NULL
     AND (
       (o.colour_reminder_sent_at IS NULL AND o.colour_email_sent_at < now() - interval '24 hours')
       OR
       (o.colour_followup_flagged_at IS NULL AND o.colour_email_sent_at < now() - interval '48 hours')
     );
$function$;

REVOKE ALL  ON FUNCTION public.colour_match_chase_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.colour_match_chase_queue() TO service_role;
